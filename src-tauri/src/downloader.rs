use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::fs;

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

#[derive(Debug, Deserialize)]
pub struct DownloadEntry {
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct LibraryEntry {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<LibraryRule>>,
}

#[derive(Debug, Deserialize)]
pub struct LibraryDownloads {
    pub artifact: Option<DownloadEntry>,
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
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

pub async fn download_version_json(version_id: &str, mc_manifest_url: &str, cache_dir: &Path) -> Result<String, String> {
    let version_dir = cache_dir.join("versions").join(version_id);
    fs::create_dir_all(&version_dir).await.map_err(|e| e.to_string())?;

    let json_path = version_dir.join(format!("{}.json", version_id));

    // If it already exists, return early (in production, verify SHA1, but keep it simple for now)
    if json_path.exists() {
        return Ok(json_path.to_string_lossy().to_string());
    }

    let response = reqwest::get(mc_manifest_url).await.map_err(|e| e.to_string())?;
    let content = response.text().await.map_err(|e| e.to_string())?;

    fs::write(&json_path, content).await.map_err(|e| e.to_string())?;
    
    Ok(json_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn instance_install(app: tauri::AppHandle, instance_id: String) -> Result<(), String> {
    use tauri::{Manager, Emitter};
    use crate::paths::{paths_get, AppPaths};
    use futures::future::join_all;
    
    // 1. Get paths
    let paths: AppPaths = paths_get(app.clone())?;
    
    // 2. Read instance to find which version it needs
    let instance_path = paths.instances.join(&instance_id).join("instance.json");
    if !instance_path.exists() {
        return Err(format!("Instance {} not found", instance_id));
    }
    
    // Quick parse just to get the mcVersion (skipping full struct for brevity in this step)
    let instance_data = fs::read_to_string(&instance_path).await.map_err(|e| e.to_string())?;
    let instance_json: serde_json::Value = serde_json::from_str(&instance_data).map_err(|e| e.to_string())?;
    
    let mc_version = instance_json["mcVersion"].as_str().ok_or("Missing mcVersion")?;
    let loader_type = instance_json["loader"].as_str().unwrap_or("vanilla");
    let loader_version = instance_json
        .get("fabricLoaderVersion")
        .and_then(|v| v.as_str())
        .or_else(|| instance_json.get("loaderVersion").and_then(|v| v.as_str()))
        .unwrap_or("");

    if loader_type == "fabric" && loader_version.is_empty() {
        return Err("Fabric instance is missing fabricLoaderVersion. Recreate or edit the instance to set a Fabric loader version.".to_string());
    }
    
    // Emit starting event
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: format!("Fetching manifest for {}", mc_version),
        progress: 5.0,
        speed: "0 B/s".to_string(),
    });

    // We need to fetch the big version manifest again to find the URL for `mc_version`
    let manifest_url = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_resp = reqwest::get(manifest_url).await.map_err(|e| e.to_string())?;
    let manifest: crate::mojang::VersionManifest = manifest_resp.json().await.map_err(|e| e.to_string())?;
    
    let version_entry = manifest.versions.iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Version {} not found in Mojang manifest", mc_version))?;
        
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Downloading version config...".to_string(),
        progress: 10.0,
        speed: "0 B/s".to_string(),
    });

    // 3. Download the specific version JSON
    let version_json_path = download_version_json(mc_version, &version_entry.url, &paths.cache).await?;
    
    // Print to verify
    println!("Version json downloaded to: {}", version_json_path);
    
    // 4. Parse the version JSON
    let v_json_str = fs::read_to_string(&version_json_path).await.map_err(|e| e.to_string())?;
    let v_data: VersionJson = serde_json::from_str(&v_json_str).map_err(|e| e.to_string())?;

    // 5. Download Client JAR
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Downloading client.jar...".to_string(),
        progress: 20.0,
        speed: "0 B/s".to_string(),
    });
    
    let versions_dir = paths.runtimes.join("versions").join(mc_version);
    fs::create_dir_all(&versions_dir).await.map_err(|e| e.to_string())?;
    
    let client_jar_path = versions_dir.join(format!("{}.jar", mc_version));
    
    if !client_jar_path.exists() {
        let client_bytes = reqwest::get(&v_data.downloads.client.url).await.map_err(|e| e.to_string())?
            .bytes().await.map_err(|e| e.to_string())?;
        fs::write(&client_jar_path, client_bytes).await.map_err(|e| e.to_string())?;
    }
    
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Downloading libraries and assets...".to_string(),
        progress: 40.0,
        speed: "0 B/s".to_string(),
    });

    // 6. Download Asset Index
    let asset_index_id = v_data.asset_index.id;
    let asset_index_url = v_data.asset_index.url;
    let indexes_dir = paths.runtimes.join("assets").join("indexes");
    fs::create_dir_all(&indexes_dir).await.map_err(|e| e.to_string())?;
    
    let index_path = indexes_dir.join(format!("{}.json", asset_index_id));
    if !index_path.exists() {
        let index_bytes = reqwest::get(&asset_index_url).await.map_err(|e| e.to_string())?
            .bytes().await.map_err(|e| e.to_string())?;
        fs::write(&index_path, index_bytes).await.map_err(|e| e.to_string())?;
    }

    // 7. Download Libraries concurrently
    let libraries_dir = paths.runtimes.join("libraries");
    fs::create_dir_all(&libraries_dir).await.map_err(|e| e.to_string())?;

    let mut valid_libs: Vec<_> = v_data.libraries.into_iter().filter_map(|lib| {
        if let Some(rules) = &lib.rules {
            let mut allow = false;
            let mut disallow = false;
            for rule in rules {
                if rule.action == "allow" {
                    if let Some(os) = &rule.os {
                        if os.name == "windows" { allow = true; }
                    } else {
                        allow = true; // no OS specified means allow for all
                    }
                } else if rule.action == "disallow" {
                    if let Some(os) = &rule.os {
                        if os.name == "windows" { disallow = true; }
                    }
                }
            }
            if !allow || disallow { return None; }
        }
        
        lib.downloads.and_then(|d| d.artifact)
    }).collect();

    // 7.5 If Fabric, append Fabric libraries to valid_libs
    if loader_type == "fabric" && !loader_version.is_empty() {
        let _ = app.emit("download_progress", DownloadProgress {
            id: instance_id.clone(),
            status: "Fetching Fabric profile...".to_string(),
            progress: 45.0,
            speed: "0 B/s".to_string(),
        });

        let fabric_profile_url = format!("https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json", mc_version, loader_version);
        let fabric_resp = reqwest::get(&fabric_profile_url).await.map_err(|e| e.to_string())?;
        let fabric_json_str = fabric_resp.text().await.map_err(|e| e.to_string())?;
        
        // Save the fabric profile so launcher.rs can read its mainClass
        let fabric_profile_path = paths.instances.join(&instance_id).join("fabric_profile.json");
        fs::write(&fabric_profile_path, &fabric_json_str).await.map_err(|e| e.to_string())?;

        let fabric_data: serde_json::Value = serde_json::from_str(&fabric_json_str).map_err(|e| e.to_string())?;
        
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
                        url: full_url
                    });
                }
            }
        }
    }

    let total_libs = valid_libs.len();
    let mut futures = Vec::new();

    for artifact in valid_libs {
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
        
        let handle = tokio::spawn(async move {
            if let Some(parent) = lib_dest_path.parent() {
                let _ = fs::create_dir_all(parent).await;
            }
            
            match reqwest::get(&url).await {
                Ok(resp) => {
                    if let Ok(bytes) = resp.bytes().await {
                        let _ = fs::write(&lib_dest_path, bytes).await;
                        return Ok(());
                    }
                }
                Err(_) => {}
            }
            Err(format!("Failed to download {}", url))
        });
        
        futures.push(handle);
    }
    
    // Wait for all library downloads
    let results = join_all(futures).await;
    let failed: Vec<_> = results.into_iter().filter(|r| r.is_err() || r.as_ref().unwrap().is_err()).collect();
    
    if !failed.is_empty() {
        println!("Warning: {} libraries failed to download.", failed.len());
    }
    
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Downloading assets...".to_string(),
        progress: 80.0,
        speed: "0 B/s".to_string(),
    });

    // 8. Download Asset Objects
    let objects_dir = paths.runtimes.join("assets").join("objects");
    fs::create_dir_all(&objects_dir).await.map_err(|e| e.to_string())?;

    let index_str = fs::read_to_string(&index_path).await.map_err(|e| e.to_string())?;
    let index_data: AssetIndex = serde_json::from_str(&index_str).map_err(|e| e.to_string())?;
    
    let objects_to_download: Vec<_> = index_data.objects.into_iter().collect();
    let _total_objects = objects_to_download.len();
    
    // Chunking to avoid too many open sockets (e.g., 50 at a time)
    for chunk in objects_to_download.chunks(50) {
        let mut object_futures = Vec::new();
        
        for (_name, obj) in chunk {
            let hash = obj.hash.clone();
            let two_char = &hash[0..2];
            let obj_dest_dir = objects_dir.join(two_char);
            let obj_dest_path = obj_dest_dir.join(&hash);
            
            // Skip if exists
            if obj_dest_path.exists() {
                continue;
            }
            
            let url = format!("https://resources.download.minecraft.net/{}/{}", two_char, hash);
            
            let handle = tokio::spawn(async move {
                let _ = fs::create_dir_all(&obj_dest_dir).await;
                match reqwest::get(&url).await {
                    Ok(resp) => {
                        if let Ok(bytes) = resp.bytes().await {
                            let _ = fs::write(&obj_dest_path, bytes).await;
                            return Ok(());
                        }
                    }
                    Err(_) => {}
                }
                Err(format!("Failed to download asset {}", hash))
            });
            object_futures.push(handle);
        }
        
        join_all(object_futures).await; // await the chunk
    }
    
    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Complete".to_string(),
        progress: 100.0,
        speed: "0 B/s".to_string(),
    });

    let _ = app.emit("download_progress", DownloadProgress {
        id: instance_id.clone(),
        status: "Installation complete!".to_string(),
        progress: 100.0,
        speed: "".to_string(),
    });

    Ok(())
}
