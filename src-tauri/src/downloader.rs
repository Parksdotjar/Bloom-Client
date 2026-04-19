use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokio::fs;
use tokio::time::{sleep, Duration};

#[allow(dead_code)]
#[derive(Debug, Serialize, Deserialize)]
pub struct AppPaths {
    pub instances: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub runtimes: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub status: String,
    pub progress: f64,
    pub speed: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct VersionJson {
    pub id: String,
    pub downloads: VersionDownloads,
    pub libraries: Vec<LibraryEntry>,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndexRef,
}

#[derive(Debug, Deserialize)]
pub struct VersionDownloads {
    pub client: DownloadEntry,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct DownloadEntry {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct LibraryEntry {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<LibraryRule>>,
    pub natives: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadEntry>,
    pub classifiers: Option<HashMap<String, DownloadEntry>>,
}

#[derive(Debug, Deserialize)]
pub struct LibraryRule {
    pub action: String,
    pub os: Option<OsRule>,
}

#[derive(Debug, Deserialize)]
pub struct OsRule {
    pub name: String,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
}

#[derive(Debug, Deserialize)]
pub struct AssetIndex {
    pub objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

fn install_cancel_set() -> &'static Mutex<HashSet<String>> {
    static CANCEL_SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    CANCEL_SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn request_install_cancel(instance_id: &str) {
    if let Ok(mut set) = install_cancel_set().lock() {
        set.insert(instance_id.to_string());
    }
}

fn clear_install_cancel(instance_id: &str) {
    if let Ok(mut set) = install_cancel_set().lock() {
        set.remove(instance_id);
    }
}

fn install_cancelled(instance_id: &str) -> bool {
    if let Ok(set) = install_cancel_set().lock() {
        return set.contains(instance_id);
    }
    false
}

async fn fetch_bytes_with_retry(
    client: &reqwest::Client,
    url: &str,
    attempts: usize,
) -> Result<Vec<u8>, String> {
    let mut last_error = String::new();

    for attempt in 0..attempts {
        match client.get(url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_error = format!("Failed to download {} (HTTP {})", url, resp.status());
                } else {
                    match resp.bytes().await {
                        Ok(bytes) => return Ok(bytes.to_vec()),
                        Err(err) => {
                            last_error =
                                format!("Failed to read response body for {}: {}", url, err);
                        }
                    }
                }
            }
            Err(err) => {
                last_error = format!("Failed to download {}: {}", url, err);
            }
        }

        if attempt + 1 < attempts {
            sleep(Duration::from_millis(250 * (attempt as u64 + 1))).await;
        }
    }

    Err(last_error)
}

fn build_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("BloomClient/1.5.3")
        .pool_idle_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(32)
        .tcp_nodelay(true)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn instance_install_cancel(instance_id: String) -> Result<(), String> {
    request_install_cancel(&instance_id);
    Ok(())
}

pub async fn download_version_json(
    version_id: &str,
    mc_manifest_url: &str,
    cache_dir: &Path,
    client: &reqwest::Client,
) -> Result<String, String> {
    let version_dir = cache_dir.join("versions").join(version_id);
    fs::create_dir_all(&version_dir)
        .await
        .map_err(|e| e.to_string())?;

    let json_path = version_dir.join(format!("{}.json", version_id));

    // If it already exists, return early (in production, verify SHA1, but keep it simple for now)
    if json_path.exists() {
        return Ok(json_path.to_string_lossy().to_string());
    }

    let response = client.get(mc_manifest_url).send().await.map_err(|e| e.to_string())?;
    let content = response.text().await.map_err(|e| e.to_string())?;

    fs::write(&json_path, content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(json_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn instance_install(app: tauri::AppHandle, instance_id: String) -> Result<(), String> {
    use crate::bloom_mod::ensure_bloom_injected_mods;
    use crate::paths::{paths_get, AppPaths};
    use futures::future::join_all;
    use tauri::Emitter;

    clear_install_cancel(&instance_id);
    let http_client = build_http_client()?;

    // 1. Get paths
    let paths: AppPaths = paths_get(app.clone())?;

    // 2. Read instance to find which version it needs
    let instance_path = paths.instances.join(&instance_id).join("instance.json");
    if !instance_path.exists() {
        return Err(format!("Instance {} not found", instance_id));
    }

    // Quick parse just to get the mcVersion (skipping full struct for brevity in this step)
    let instance_data = fs::read_to_string(&instance_path)
        .await
        .map_err(|e| e.to_string())?;
    let instance_json: serde_json::Value =
        serde_json::from_str(&instance_data).map_err(|e| e.to_string())?;

    let mc_version = instance_json["mcVersion"]
        .as_str()
        .ok_or("Missing mcVersion")?;
    let loader_type = instance_json["loader"].as_str().unwrap_or("vanilla");
    let renderer = instance_json
        .get("renderer")
        .and_then(|value| value.as_str())
        .unwrap_or("opengl");
    let instance_dir = paths.instances.join(&instance_id);
    let loader_version = instance_json
        .get("fabricLoaderVersion")
        .and_then(|v| v.as_str())
        .or_else(|| instance_json.get("loaderVersion").and_then(|v| v.as_str()))
        .unwrap_or("");

    if loader_type == "fabric" && loader_version.is_empty() {
        return Err("Fabric instance is missing fabricLoaderVersion. Recreate or edit the instance to set a Fabric loader version.".to_string());
    }

    // Emit starting event
    if install_cancelled(&instance_id) {
        return Err("Installation cancelled by user.".to_string());
    }

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: format!("Fetching manifest for {}", mc_version),
            progress: 5.0,
            speed: "0 B/s".to_string(),
        },
    );

    // We need to fetch the big version manifest again to find the URL for `mc_version`
    let manifest_url = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_resp = http_client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if install_cancelled(&instance_id) {
        return Err("Installation cancelled by user.".to_string());
    }
    let manifest: crate::mojang::VersionManifest =
        manifest_resp.json().await.map_err(|e| e.to_string())?;

    let version_entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Version {} not found in Mojang manifest", mc_version))?;

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Downloading version config...".to_string(),
            progress: 10.0,
            speed: "0 B/s".to_string(),
        },
    );

    // 3. Download the specific version JSON
    let version_json_path =
        download_version_json(mc_version, &version_entry.url, &paths.cache, &http_client).await?;
    if install_cancelled(&instance_id) {
        return Err("Installation cancelled by user.".to_string());
    }

    // Print to verify
    println!("Version json downloaded to: {}", version_json_path);

    // 4. Parse the version JSON
    let v_json_str = fs::read_to_string(&version_json_path)
        .await
        .map_err(|e| e.to_string())?;
    let v_data: VersionJson = serde_json::from_str(&v_json_str).map_err(|e| e.to_string())?;

    // 5. Download Client JAR
    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Downloading client.jar...".to_string(),
            progress: 20.0,
            speed: "0 B/s".to_string(),
        },
    );

    let versions_dir = paths.runtimes.join("versions").join(mc_version);
    fs::create_dir_all(&versions_dir)
        .await
        .map_err(|e| e.to_string())?;

    let client_jar_path = versions_dir.join(format!("{}.jar", mc_version));

    if !client_jar_path.exists() {
        let client_bytes = http_client
            .get(&v_data.downloads.client.url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        fs::write(&client_jar_path, client_bytes)
            .await
            .map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Downloading libraries and assets...".to_string(),
            progress: 40.0,
            speed: "0 B/s".to_string(),
        },
    );

    // 6. Download Asset Index
    let asset_index_id = v_data.asset_index.id;
    let asset_index_url = v_data.asset_index.url;
    let indexes_dir = paths.runtimes.join("assets").join("indexes");
    fs::create_dir_all(&indexes_dir)
        .await
        .map_err(|e| e.to_string())?;

    let index_path = indexes_dir.join(format!("{}.json", asset_index_id));
    if !index_path.exists() {
        let index_bytes = http_client
            .get(&asset_index_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        fs::write(&index_path, index_bytes)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 7. Download Libraries concurrently
    let libraries_dir = paths.runtimes.join("libraries");
    fs::create_dir_all(&libraries_dir)
        .await
        .map_err(|e| e.to_string())?;

    let library_allowed_on_windows = |rules: &Option<Vec<LibraryRule>>| -> bool {
        match rules {
            None => true,
            Some(rule_set) => {
                // Mojang rule behavior: when rules exist, default is disallow,
                // then matching rules toggle allow/disallow in order.
                let mut allowed = false;
                for rule in rule_set {
                    let matches_os = rule
                        .os
                        .as_ref()
                        .map(|os| os.name.eq_ignore_ascii_case("windows"))
                        .unwrap_or(true);
                    if matches_os {
                        allowed = rule.action == "allow";
                    }
                }
                allowed
            }
        }
    };

    let mut valid_libs: Vec<DownloadEntry> = Vec::new();
    for lib in v_data.libraries {
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        if !library_allowed_on_windows(&lib.rules) {
            continue;
        }

        if let Some(downloads) = lib.downloads {
            if let Some(artifact) = downloads.artifact {
                valid_libs.push(artifact);
            }

            if let Some(classifiers) = downloads.classifiers {
                let arch_token = if cfg!(target_pointer_width = "64") {
                    "64"
                } else {
                    "32"
                };
                let native_key = lib
                    .natives
                    .as_ref()
                    .and_then(|n| n.get("windows"))
                    .map(|k| k.replace("${arch}", arch_token));

                let selected = if let Some(key) = native_key {
                    classifiers.get(&key).cloned()
                } else {
                    classifiers
                        .get("natives-windows")
                        .cloned()
                        .or_else(|| classifiers.get("natives-windows-64").cloned())
                        .or_else(|| classifiers.get("natives-windows-x86_64").cloned())
                        .or_else(|| classifiers.get("natives-windows-32").cloned())
                };

                if let Some(native_artifact) = selected {
                    valid_libs.push(native_artifact);
                }
            }
        }
    }

    // 7.5 If Fabric, append Fabric libraries to valid_libs
    if loader_type == "fabric" && !loader_version.is_empty() {
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        let _ = app.emit(
            "download_progress",
            DownloadProgress {
                id: instance_id.clone(),
                status: "Fetching Fabric profile...".to_string(),
                progress: 45.0,
                speed: "0 B/s".to_string(),
            },
        );

        let fabric_profile_url = format!(
            "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
            mc_version, loader_version
        );
        let fabric_resp = http_client
            .get(&fabric_profile_url)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let fabric_json_str = fabric_resp.text().await.map_err(|e| e.to_string())?;

        // Save the fabric profile so launcher.rs can read its mainClass
        let fabric_profile_path = paths
            .instances
            .join(&instance_id)
            .join("fabric_profile.json");
        fs::write(&fabric_profile_path, &fabric_json_str)
            .await
            .map_err(|e| e.to_string())?;

        let fabric_data: serde_json::Value =
            serde_json::from_str(&fabric_json_str).map_err(|e| e.to_string())?;

        if let Some(libs) = fabric_data["libraries"].as_array() {
            for lib in libs {
                let name = lib["name"].as_str().unwrap_or("");
                let url = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");

                // Convert Maven coordinates "net.fabricmc:fabric-loader:0.16.5" to path format
                let parts: Vec<&str> = name.split(':').collect();
                if parts.len() == 3 {
                    let domain = parts[0].replace('.', "/");
                    let artifact = parts[1];
                    let version = parts[2];
                    let filename = format!("{}-{}.jar", artifact, version);
                    let path = format!("{}/{}/{}/{}", domain, artifact, version, filename);
                    let full_url = format!("{}{}", url, path);

                    valid_libs.push(DownloadEntry {
                        path: Some(path.clone()),
                        sha1: "".to_string(), // Fabric index doesn't provide sha1 directly in this block
                        size: 0,
                        url: full_url,
                    });
                }
            }
        }
    }

    let _total_libs = valid_libs.len();
    let mut futures = Vec::new();

    for artifact in &valid_libs {
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        let artifact_path_str = match &artifact.path {
            Some(p) => p.clone(),
            None => {
                // If path is missing, infer from URL filename. Not perfect but works for simple cases.
                let parts: Vec<&str> = artifact.url.split('/').collect();
                parts.last().unwrap_or(&"unknown.jar").to_string()
            }
        };

        let lib_dest_path = libraries_dir.join(artifact_path_str);

        // Skip if already downloaded
        if lib_dest_path.exists() {
            continue;
        }

        let url = artifact.url.clone();
        let client = http_client.clone();

            let handle = tokio::spawn(async move {
                if let Some(parent) = lib_dest_path.parent() {
                    let _ = fs::create_dir_all(parent).await;
                }

                let bytes = fetch_bytes_with_retry(&client, &url, 3).await?;
                fs::write(&lib_dest_path, bytes)
                    .await
                    .map_err(|e| format!("Failed to write library {}: {}", url, e))?;
                Ok::<(), String>(())
            });

        futures.push(handle);
    }

    // Wait for all library downloads
    let results = join_all(futures).await;
    if install_cancelled(&instance_id) {
        return Err("Installation cancelled by user.".to_string());
    }
    let mut failed_libs: Vec<String> = Vec::new();
    for result in results {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => failed_libs.push(e),
            Err(join_err) => {
                failed_libs.push(format!("Library download task failed: {}", join_err))
            }
        }
    }
    if !failed_libs.is_empty() {
        let mut retry_errors: Vec<String> = Vec::new();

        for artifact in &valid_libs {
            if install_cancelled(&instance_id) {
                return Err("Installation cancelled by user.".to_string());
            }

            let artifact_path_str = match &artifact.path {
                Some(p) => p.clone(),
                None => {
                    let parts: Vec<&str> = artifact.url.split('/').collect();
                    parts.last().unwrap_or(&"unknown.jar").to_string()
                }
            };

            let lib_dest_path = libraries_dir.join(artifact_path_str);
            if lib_dest_path.exists() {
                continue;
            }

            if let Some(parent) = lib_dest_path.parent() {
                fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Failed to prepare library directory: {}", e))?;
            }

            match fetch_bytes_with_retry(&http_client, &artifact.url, 4).await {
                Ok(bytes) => {
                    if let Err(err) = fs::write(&lib_dest_path, bytes).await {
                        retry_errors.push(format!(
                            "Failed to write library {}: {}",
                            artifact.url, err
                        ));
                    }
                }
                Err(err) => retry_errors.push(err),
            }
        }

        failed_libs = retry_errors;
    }
    if !failed_libs.is_empty() {
        return Err(format!(
            "Installation failed: {} libraries could not be downloaded. First error: {}",
            failed_libs.len(),
            failed_libs
                .first()
                .cloned()
                .unwrap_or_else(|| "unknown".to_string())
        ));
    }

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Downloading assets...".to_string(),
            progress: 80.0,
            speed: "0 B/s".to_string(),
        },
    );

    // 8. Download Asset Objects
    let objects_dir = paths.runtimes.join("assets").join("objects");
    fs::create_dir_all(&objects_dir)
        .await
        .map_err(|e| e.to_string())?;

    let index_str = fs::read_to_string(&index_path)
        .await
        .map_err(|e| e.to_string())?;
    let index_data: AssetIndex = serde_json::from_str(&index_str).map_err(|e| e.to_string())?;

    let objects_to_download: Vec<_> = index_data.objects.into_iter().collect();
    let _total_objects = objects_to_download.len();

    // Keep more asset requests in flight per batch to reduce idle time between chunks.
    for chunk in objects_to_download.chunks(96) {
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        let mut object_futures = Vec::new();
        let mut chunk_entries = Vec::new();

        for (_name, obj) in chunk {
            let hash = obj.hash.clone();
            let two_char = &hash[0..2];
            let obj_dest_dir = objects_dir.join(two_char);
            let obj_dest_path = obj_dest_dir.join(&hash);

            // Skip if exists
            if obj_dest_path.exists() {
                continue;
            }

            let url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                two_char, hash
            );
            let client = http_client.clone();
            chunk_entries.push((hash.clone(), obj_dest_dir.clone(), obj_dest_path.clone(), url.clone()));

            let handle = tokio::spawn(async move {
                let _ = fs::create_dir_all(&obj_dest_dir).await;
                let bytes = fetch_bytes_with_retry(&client, &url, 3)
                    .await
                    .map_err(|e| format!("Failed to download asset {}: {}", hash, e))?;
                fs::write(&obj_dest_path, bytes)
                    .await
                    .map_err(|e| format!("Failed to write asset {}: {}", hash, e))?;
                Ok::<(), String>(())
            });
            object_futures.push(handle);
        }

        let object_results = join_all(object_futures).await;
        if install_cancelled(&instance_id) {
            return Err("Installation cancelled by user.".to_string());
        }
        let mut failed_assets = 0usize;
        for result in object_results {
            match result {
                Ok(Ok(())) => {}
                Ok(Err(_)) | Err(_) => failed_assets += 1,
            }
        }
        if failed_assets > 0 {
            let mut retry_errors = Vec::new();

            for (hash, obj_dest_dir, obj_dest_path, url) in chunk_entries {
                if install_cancelled(&instance_id) {
                    return Err("Installation cancelled by user.".to_string());
                }
                if obj_dest_path.exists() {
                    continue;
                }

                fs::create_dir_all(&obj_dest_dir)
                    .await
                    .map_err(|e| format!("Failed to prepare asset directory: {}", e))?;

                match fetch_bytes_with_retry(&http_client, &url, 4).await {
                    Ok(bytes) => {
                        if let Err(err) = fs::write(&obj_dest_path, bytes).await {
                            retry_errors.push(format!("Failed to write asset {}: {}", hash, err));
                        }
                    }
                    Err(err) => retry_errors.push(format!("Failed to download asset {}: {}", hash, err)),
                }
            }

            if !retry_errors.is_empty() {
                return Err(format!(
                    "Installation failed: {} assets could not be downloaded. First error: {}",
                    retry_errors.len(),
                    retry_errors
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "unknown".to_string())
                ));
            }
        }
    }

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Complete".to_string(),
            progress: 100.0,
            speed: "0 B/s".to_string(),
        },
    );

    let _ = app.emit(
        "download_progress",
        DownloadProgress {
            id: instance_id.clone(),
            status: "Installation complete!".to_string(),
            progress: 100.0,
            speed: "".to_string(),
        },
    );

    ensure_bloom_injected_mods(&instance_dir, loader_type, mc_version, renderer).await?;
    clear_install_cancel(&instance_id);

    Ok(())
}
