use serde::{Deserialize, Serialize};
use std::fs;
use tauri::AppHandle;
use crate::paths::paths_get;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use std::env;
use std::io::{Cursor, Read};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String, // "vanilla" | "fabric"
    pub fabric_loader_version: Option<String>,
    pub icon_data_url: Option<String>,
    pub cover_data_url: Option<String>,
    pub color_tag: Option<String>,
    pub icon_frame: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub java: JavaConfig,
    pub memory_mb: u32,
    pub jvm_args: Vec<String>,
    pub resolution: Resolution,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JavaConfig {
    pub path_override: Option<String>,
    pub runtime: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpload {
    pub name: String,
    pub data: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInstallResult {
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceModFile {
    pub file_name: String,
    pub display_name: String,
    pub enabled: bool,
    pub size_bytes: u64,
    pub updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceMod {
    pub id: String,
    pub source: String, // "modrinth" | "curseforge"
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub author: Option<String>,
    pub downloads: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePack {
    pub id: String,
    pub source: String, // "modrinth" | "curseforge"
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub author: Option<String>,
    pub downloads: u64,
    pub available_versions: Vec<String>,
    pub supported_loaders: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthFile>,
}

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct MrpackIndex {
    pub dependencies: Option<std::collections::HashMap<String, String>>,
    pub files: Vec<MrpackFileEntry>,
}

#[derive(Debug, Deserialize)]
struct MrpackFileEntry {
    pub path: String,
    pub downloads: Vec<String>,
    pub env: Option<MrpackEnv>,
}

#[derive(Debug, Deserialize)]
struct MrpackEnv {
    pub client: Option<String>,
}

fn is_valid_jar(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

fn is_valid_pack_file(bytes: &[u8], file_name: &str) -> bool {
    let lowered = file_name.to_ascii_lowercase();
    let is_supported_ext = lowered.ends_with(".jar")
        || lowered.ends_with(".zip")
        || lowered.ends_with(".mrpack");
    is_supported_ext && bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

fn build_default_instance(id: String, name: String, mc_version: String, loader: String) -> Instance {
    Instance {
        id,
        name,
        mc_version,
        loader,
        fabric_loader_version: None,
        icon_data_url: None,
        cover_data_url: None,
        color_tag: None,
        icon_frame: Some("rounded".to_string()),
        created_at: chrono_now_millis(),
        updated_at: chrono_now_millis(),
        java: JavaConfig {
            path_override: None,
            runtime: None,
        },
        memory_mb: 4096,
        jvm_args: vec![],
        resolution: Resolution {
            width: 1280,
            height: 720,
            fullscreen: false,
        },
    }
}

fn chrono_now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn safe_join_relative(base: &Path, rel: &str) -> Option<PathBuf> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return None;
    }

    let mut out = PathBuf::from(base);
    for component in rel_path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

fn mrpack_client_enabled(env: &Option<MrpackEnv>) -> bool {
    match env {
        Some(v) => match v.client.as_deref() {
            Some("unsupported") => false,
            _ => true,
        },
        None => true,
    }
}

async fn install_modrinth_mrpack_contents(
    instance_dir: &Path,
    mrpack_bytes: &[u8],
    client: &reqwest::Client,
) -> Result<(Option<String>, usize, usize), String> {
    let (index, override_files) = {
        let cursor = Cursor::new(mrpack_bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid mrpack archive: {}", e))?;

        let mut index_entry = archive
            .by_name("modrinth.index.json")
            .map_err(|_| "This .mrpack is missing modrinth.index.json".to_string())?;
        let mut index_str = String::new();
        index_entry
            .read_to_string(&mut index_str)
            .map_err(|e| format!("Failed reading modrinth.index.json: {}", e))?;
        drop(index_entry);

        let parsed_index: MrpackIndex =
            serde_json::from_str(&index_str).map_err(|e| format!("Invalid modrinth.index.json: {}", e))?;

        let mut extracted_override_files = 0usize;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let entry_name = file.name().to_string();
            let rel = entry_name
                .strip_prefix("overrides/")
                .or_else(|| entry_name.strip_prefix("client-overrides/"));
            let Some(rel_path) = rel else {
                continue;
            };
            if rel_path.is_empty() {
                continue;
            }

            let output_path = match safe_join_relative(instance_dir, rel_path) {
                Some(p) => p,
                None => continue,
            };

            if file.is_dir() {
                fs::create_dir_all(&output_path).map_err(|e| e.to_string())?;
                continue;
            }

            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let mut out_file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
            extracted_override_files += 1;
        }

        (parsed_index, extracted_override_files)
    };

    let mut downloaded_files = 0usize;
    for entry in &index.files {
        if !mrpack_client_enabled(&entry.env) {
            continue;
        }

        let target = safe_join_relative(instance_dir, &entry.path)
            .ok_or_else(|| format!("Blocked unsafe pack path: {}", entry.path))?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut downloaded: Option<Vec<u8>> = None;
        for url in &entry.downloads {
            let attempt = client
                .get(url)
                .header("User-Agent", "BloomClient/0.1.0")
                .send()
                .await;
            if let Ok(resp) = attempt {
                if let Ok(ok_resp) = resp.error_for_status() {
                    if let Ok(bytes) = ok_resp.bytes().await {
                        downloaded = Some(bytes.to_vec());
                        break;
                    }
                }
            }
        }

        let bytes = downloaded.ok_or_else(|| format!("Failed to download pack file: {}", entry.path))?;
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        downloaded_files += 1;
    }

    let fabric_loader_version = index
        .dependencies
        .as_ref()
        .and_then(|deps| deps.get("fabric-loader").cloned());

    Ok((fabric_loader_version, downloaded_files, override_files))
}

#[tauri::command]
pub fn instances_list(app: AppHandle) -> Result<Vec<Instance>, String> {
    let paths = paths_get(app)?;
    let mut instances = Vec::new();

    if let Ok(entries) = fs::read_dir(paths.instances) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let instance_file = path.join("instance.json");
                if let Ok(content) = fs::read_to_string(&instance_file) {
                    if let Ok(inst) = serde_json::from_str::<Instance>(&content) {
                        instances.push(inst);
                    }
                }
            }
        }
    }

    Ok(instances)
}

#[tauri::command]
pub fn instances_create(app: AppHandle, payload: Instance) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&payload.id);
    fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;

    let instance_file = instance_dir.join("instance.json");
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&instance_file, content).map_err(|e| e.to_string())?;

    Ok(payload)
}

#[tauri::command]
pub fn instances_update(app: AppHandle, id: String, payload: Instance) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let instance_file = instance_dir.join("instance.json");
    let content = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&instance_file, content).map_err(|e| e.to_string())?;

    Ok(payload)
}

#[tauri::command]
pub fn instances_delete(app: AppHandle, id: String) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&id);
    if instance_dir.exists() {
        fs::remove_dir_all(&instance_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn open_mods_folder(app: tauri::AppHandle, id: String) -> Result<(), String> {
    use crate::paths::{paths_get, AppPaths};
    use std::process::Command;
    use std::fs;

    let paths: AppPaths = paths_get(app)?;
    let instance_dir = paths.instances.join(&id);
    let mods_dir = instance_dir.join("mods");

    // Ensure it exists before opening
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(mods_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn instance_install_mod_files(app: AppHandle, instance_id: String, files: Vec<ModUpload>) -> Result<ModInstallResult, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mut installed = Vec::new();
    let mut skipped = Vec::new();

    for file in files {
        let safe_name = Path::new(&file.name)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        if safe_name.is_empty() || !safe_name.to_ascii_lowercase().ends_with(".jar") {
            skipped.push(file.name);
            continue;
        }

        // Reject empty or obviously invalid JAR uploads so Fabric won't crash at launch.
        if file.data.is_empty() || file.data.len() < 4 {
            skipped.push(file.name);
            continue;
        }

        let is_zip_header = file.data[0] == 0x50 && file.data[1] == 0x4B;
        if !is_zip_header {
            skipped.push(file.name);
            continue;
        }

        let target = mods_dir.join(safe_name);
        fs::write(target, file.data).map_err(|e| e.to_string())?;
        installed.push(safe_name.to_string());
    }

    Ok(ModInstallResult { installed, skipped })
}

#[tauri::command]
pub fn instance_install_mod_paths(app: AppHandle, instance_id: String, paths: Vec<String>) -> Result<ModInstallResult, String> {
    let app_paths = paths_get(app)?;
    let instance_dir = app_paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mut installed = Vec::new();
    let mut skipped = Vec::new();

    for raw_path in paths {
        let source = Path::new(&raw_path);
        let safe_name = source.file_name().and_then(|s| s.to_str()).unwrap_or("");

        if safe_name.is_empty() || !safe_name.to_ascii_lowercase().ends_with(".jar") {
            skipped.push(raw_path);
            continue;
        }

        let metadata = match fs::metadata(source) {
            Ok(m) => m,
            Err(_) => {
                skipped.push(raw_path);
                continue;
            }
        };

        if metadata.len() == 0 {
            skipped.push(raw_path);
            continue;
        }

        let bytes = match fs::read(source) {
            Ok(b) => b,
            Err(_) => {
                skipped.push(raw_path);
                continue;
            }
        };

        if bytes.len() < 4 || bytes[0] != 0x50 || bytes[1] != 0x4B {
            skipped.push(raw_path);
            continue;
        }

        let target = mods_dir.join(safe_name);
        fs::copy(source, target).map_err(|e| e.to_string())?;
        installed.push(safe_name.to_string());
    }

    Ok(ModInstallResult { installed, skipped })
}

#[tauri::command]
pub async fn instance_install_fabric_api(app: AppHandle, instance_id: String) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let instance_file = instance_dir.join("instance.json");
    let content = fs::read_to_string(&instance_file).map_err(|e| e.to_string())?;
    let instance: Instance = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if instance.loader.to_ascii_lowercase() != "fabric" {
        return Err("Fabric API install is only available for Fabric instances.".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let versions_url = "https://api.modrinth.com/v2/project/fabric-api/version";
    let versions: Vec<ModrinthVersion> = client
        .get(versions_url)
        .header("User-Agent", "BloomClient/0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let matching = versions
        .into_iter()
        .find(|v| {
            v.game_versions.iter().any(|g| g == &instance.mc_version)
                && v.loaders.iter().any(|l| l == "fabric")
        })
        .ok_or_else(|| format!("No Fabric API build found for Minecraft {}", instance.mc_version))?;

    let file = matching
        .files
        .iter()
        .find(|f| f.primary.unwrap_or(false))
        .or_else(|| matching.files.first())
        .ok_or_else(|| "No downloadable file found for Fabric API.".to_string())?;

    let bytes = client
        .get(&file.url)
        .header("User-Agent", "BloomClient/0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let target = mods_dir.join(&file.filename);
    fs::write(&target, bytes).map_err(|e| e.to_string())?;

    Ok(file.filename.clone())
}

#[tauri::command]
pub fn instance_list_mods(app: AppHandle, instance_id: String) -> Result<Vec<InstanceModFile>, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mut mods = Vec::new();
    let entries = fs::read_dir(&mods_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };

        let lowered = file_name.to_ascii_lowercase();
        let is_enabled = lowered.ends_with(".jar");
        let is_disabled = lowered.ends_with(".jar.disabled");

        if !is_enabled && !is_disabled {
            continue;
        }

        let display_name = if is_disabled {
            file_name.trim_end_matches(".disabled").to_string()
        } else {
            file_name.clone()
        };

        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let updated_at = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        mods.push(InstanceModFile {
            file_name,
            display_name,
            enabled: is_enabled,
            size_bytes: meta.len(),
            updated_at,
        });
    }

    mods.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(mods)
}

#[tauri::command]
pub fn instance_toggle_mod(app: AppHandle, instance_id: String, file_name: String, enabled: bool) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let current = mods_dir.join(&file_name);
    if !current.exists() {
        return Err("Mod file not found.".into());
    }

    let next_name = if enabled {
        file_name.trim_end_matches(".disabled").to_string()
    } else if file_name.to_ascii_lowercase().ends_with(".disabled") {
        file_name.clone()
    } else {
        format!("{file_name}.disabled")
    };

    let next_path = mods_dir.join(&next_name);
    fs::rename(&current, &next_path).map_err(|e| e.to_string())?;
    Ok(next_name)
}

#[tauri::command]
pub fn instance_disable_incompatible_mods(app: AppHandle, instance_id: String) -> Result<Vec<String>, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let mut disabled: Vec<String> = Vec::new();
    let entries = fs::read_dir(&mods_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let lowered = file_name.to_ascii_lowercase();

        if !lowered.ends_with(".jar") {
            continue;
        }

        let should_disable = lowered.contains("essential")
            || lowered.contains("fabric-networking-api-v1")
            || lowered.contains("fabric-api-base");
        if !should_disable {
            continue;
        }

        let new_name = format!("{}.disabled", file_name);
        let new_path = mods_dir.join(&new_name);
        fs::rename(&path, &new_path).map_err(|e| e.to_string())?;
        disabled.push(file_name);
    }

    Ok(disabled)
}

#[tauri::command]
pub fn instance_delete_mod(app: AppHandle, instance_id: String, file_name: String) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let mods_dir = instance_dir.join("mods");
    let target = mods_dir.join(&file_name);
    if !target.exists() {
        return Err("Mod file not found.".into());
    }

    fs::remove_file(target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn marketplace_search_mods(
    query: String,
    source: Option<String>,
    loader: Option<String>,
    game_version: Option<String>,
) -> Result<Vec<MarketplaceMod>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let mut out: Vec<MarketplaceMod> = Vec::new();
    let source_mode = source.unwrap_or_else(|| "all".to_string()).to_ascii_lowercase();
    let loader_value = loader.unwrap_or_else(|| "fabric".to_string()).to_ascii_lowercase();
    let version_value = game_version.unwrap_or_else(|| "1.21.1".to_string());

    if source_mode == "all" || source_mode == "modrinth" {
        let facets = format!(
            "[[\"project_type:mod\"],[\"versions:{}\"],[\"categories:{}\"]]",
            version_value, loader_value
        );
        let modrinth_url = format!(
            "https://api.modrinth.com/v2/search?query={}&limit=30&facets={}",
            urlencoding::encode(q),
            urlencoding::encode(&facets)
        );
        let res = client
            .get(modrinth_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(hits) = body.get("hits").and_then(|v| v.as_array()) {
                for hit in hits {
                    out.push(MarketplaceMod {
                        id: hit.get("project_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        source: "modrinth".to_string(),
                        title: hit.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                        description: hit.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        icon_url: hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        author: hit.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let curse_api_key = env::var("CURSEFORGE_API_KEY").ok();
        if let Some(api_key) = curse_api_key {
            let curse_url = format!(
                "https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc&gameVersion={}",
                urlencoding::encode(q),
                urlencoding::encode(&version_value)
            );
            let res = client
                .get(curse_url)
                .header("x-api-key", api_key)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if res.status().is_success() {
                let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
                if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
                    for item in items {
                        out.push(MarketplaceMod {
                            id: item.get("id").and_then(|v| v.as_i64()).unwrap_or_default().to_string(),
                            source: "curseforge".to_string(),
                            title: item.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                            description: item.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            icon_url: item.get("logo").and_then(|v| v.get("thumbnailUrl")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                            author: item
                                .get("authors")
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|a| a.get("name"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            downloads: item.get("downloadCount").and_then(|v| v.as_f64()).unwrap_or(0.0) as u64,
                        });
                    }
                }
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn marketplace_install_mod(
    app: AppHandle,
    instance_id: String,
    source: String,
    project_id: String,
) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let instance_file = instance_dir.join("instance.json");
    let content = fs::read_to_string(&instance_file).map_err(|e| e.to_string())?;
    let instance: Instance = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let source_mode = source.to_ascii_lowercase();
    let loader = instance.loader.to_ascii_lowercase();
    let game_version = instance.mc_version.clone();
    let client = reqwest::Client::new();

    if source_mode == "modrinth" {
        let versions_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
        let versions: Vec<ModrinthVersion> = client
            .get(versions_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let matching = versions
            .into_iter()
            .find(|v| {
                v.game_versions.iter().any(|g| g == &game_version)
                    && v.loaders.iter().any(|l| l.eq_ignore_ascii_case(&loader))
            })
            .ok_or_else(|| format!("No compatible Modrinth file for {} {}", loader, game_version))?;

        let file = matching
            .files
            .iter()
            .find(|f| f.primary.unwrap_or(false))
            .or_else(|| matching.files.first())
            .ok_or_else(|| "No downloadable file found.".to_string())?;

        let bytes = client
            .get(&file.url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        if !is_valid_jar(&bytes) {
            return Err("Downloaded file is not a valid .jar mod.".into());
        }

        let target = mods_dir.join(&file.filename);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file.filename.clone());
    }

    if source_mode == "curseforge" {
        let api_key = env::var("CURSEFORGE_API_KEY")
            .map_err(|_| "CurseForge API key missing. Set CURSEFORGE_API_KEY in your environment.".to_string())?;

        let files_url = format!(
            "https://api.curseforge.com/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            project_id,
            urlencoding::encode(&game_version)
        );
        let files_res = client
            .get(files_url)
            .header("x-api-key", api_key)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let body: serde_json::Value = files_res.json().await.map_err(|e| e.to_string())?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable").and_then(|v| v.as_bool()).unwrap_or(true)
                    && row.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_ascii_lowercase().ends_with(".jar")
            })
            .ok_or("No downloadable CurseForge jar file found.")?;

        let download_url = file
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("CurseForge did not provide a direct download URL for this file.")?;
        let file_name = file
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("mod.jar")
            .to_string();

        let bytes = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        if !is_valid_jar(&bytes) {
            return Err("Downloaded file is not a valid .jar mod.".into());
        }

        let target = mods_dir.join(&file_name);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }

    Err("Unsupported source. Use modrinth or curseforge.".into())
}

#[tauri::command]
pub async fn marketplace_search_modpacks(
    query: String,
    source: Option<String>,
) -> Result<Vec<MarketplacePack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let mut out: Vec<MarketplacePack> = Vec::new();
    let source_mode = source.unwrap_or_else(|| "all".to_string()).to_ascii_lowercase();

    if source_mode == "all" || source_mode == "modrinth" {
        let facets = "[[\"project_type:modpack\"]]";
        let modrinth_url = format!(
            "https://api.modrinth.com/v2/search?query={}&limit=30&facets={}",
            urlencoding::encode(q),
            urlencoding::encode(facets)
        );
        let res = client
            .get(modrinth_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(hits) = body.get("hits").and_then(|v| v.as_array()) {
                for hit in hits {
                    let available_versions = hit
                        .get("versions")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();
                    let supported_loaders = hit
                        .get("categories")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_ascii_lowercase()))
                                .filter(|s| s == "fabric" || s == "forge" || s == "quilt" || s == "neoforge")
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();

                    out.push(MarketplacePack {
                        id: hit.get("project_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        source: "modrinth".to_string(),
                        title: hit.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                        description: hit.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        icon_url: hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        author: hit.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                        available_versions,
                        supported_loaders,
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let curse_api_key = env::var("CURSEFORGE_API_KEY").ok();
        if let Some(api_key) = curse_api_key {
            let curse_url = format!(
                "https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc",
                urlencoding::encode(q)
            );
            let res = client
                .get(curse_url)
                .header("x-api-key", api_key)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if res.status().is_success() {
                let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
                if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
                    for item in items {
                        let available_versions = item
                            .get("latestFilesIndexes")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|idx| idx.get("gameVersion").and_then(|v| v.as_str()).map(|s| s.to_string()))
                                    .collect::<Vec<String>>()
                            })
                            .unwrap_or_default();

                        out.push(MarketplacePack {
                            id: item.get("id").and_then(|v| v.as_i64()).unwrap_or_default().to_string(),
                            source: "curseforge".to_string(),
                            title: item.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                            description: item.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            icon_url: item.get("logo").and_then(|v| v.get("thumbnailUrl")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                            author: item
                                .get("authors")
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|a| a.get("name"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            downloads: item.get("downloadCount").and_then(|v| v.as_f64()).unwrap_or(0.0) as u64,
                            available_versions,
                            supported_loaders: vec![],
                        });
                    }
                }
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn marketplace_install_modpack_instance(
    app: AppHandle,
    source: String,
    project_id: String,
    game_version: String,
) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let client = reqwest::Client::new();
    let source_mode = source.to_ascii_lowercase();

    let (pack_file_name, pack_bytes, loader_name, title_name) = if source_mode == "modrinth" {
        let versions_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
        let versions: Vec<ModrinthVersion> = client
            .get(versions_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let matching = versions
            .into_iter()
            .find(|v| v.game_versions.iter().any(|g| g == &game_version))
            .ok_or_else(|| format!("No modpack version found for Minecraft {}", game_version))?;

        let selected_loader = if matching.loaders.iter().any(|l| l.eq_ignore_ascii_case("fabric")) {
            "fabric".to_string()
        } else {
            return Err("This modpack version is not Fabric-based. Bloom currently installs Fabric modpacks only.".to_string());
        };

        let file = matching
            .files
            .iter()
            .find(|f| f.primary.unwrap_or(false))
            .or_else(|| matching.files.first())
            .ok_or_else(|| "No downloadable file found.".to_string())?;

        let bytes = client
            .get(&file.url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec();

        let project_url = format!("https://api.modrinth.com/v2/project/{}", project_id);
        let project_info: serde_json::Value = client
            .get(project_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        let title = project_info
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Imported Modpack")
            .to_string();

        (file.filename.clone(), bytes, selected_loader, title)
    } else if source_mode == "curseforge" {
        let api_key = env::var("CURSEFORGE_API_KEY")
            .map_err(|_| "CurseForge API key missing. Set CURSEFORGE_API_KEY in your environment.".to_string())?;

        let files_url = format!(
            "https://api.curseforge.com/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            project_id,
            urlencoding::encode(&game_version)
        );
        let files_res = client
            .get(files_url)
            .header("x-api-key", api_key.clone())
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let body: serde_json::Value = files_res.json().await.map_err(|e| e.to_string())?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable").and_then(|v| v.as_bool()).unwrap_or(true)
                    && row.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_ascii_lowercase().ends_with(".zip")
            })
            .ok_or("No downloadable CurseForge modpack zip found for this version.")?;

        let download_url = file
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("CurseForge did not provide a direct download URL for this file.")?;
        let file_name = file
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("modpack.zip")
            .to_string();

        let bytes = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?
            .to_vec();

        let mod_url = format!("https://api.curseforge.com/v1/mods/{}", project_id);
        let mod_info: serde_json::Value = client
            .get(mod_url)
            .header("x-api-key", api_key)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        let title = mod_info
            .get("data")
            .and_then(|v| v.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Imported Modpack")
            .to_string();

        (file_name, bytes, "fabric".to_string(), title)
    } else {
        return Err("Unsupported source. Use modrinth or curseforge.".into());
    };

    if !is_valid_pack_file(&pack_bytes, &pack_file_name) {
        return Err("Downloaded modpack file is invalid or unsupported.".into());
    }

    let id = format!(
        "pack-{}-{}",
        chrono_now_millis(),
        project_id.chars().take(6).collect::<String>()
    );
    let mut instance = build_default_instance(id.clone(), title_name, game_version.clone(), loader_name);

    let instance_dir = paths.instances.join(&id);
    fs::create_dir_all(instance_dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("resourcepacks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("shaderpacks")).map_err(|e| e.to_string())?;
    fs::write(instance_dir.join("modpack_source.txt"), format!("source={}\nproject={}\nversion={}\n", source_mode, project_id, game_version))
        .map_err(|e| e.to_string())?;

    let lower_file_name = pack_file_name.to_ascii_lowercase();
    let install_report = if source_mode == "modrinth" && lower_file_name.ends_with(".mrpack") {
        let (fabric_loader, downloaded_count, override_count) =
            install_modrinth_mrpack_contents(&instance_dir, &pack_bytes, &client).await?;
        if fabric_loader.is_some() {
            instance.fabric_loader_version = fabric_loader;
        }
        format!(
            "mrpack install completed\ndownloaded_files={}\noverrides_extracted={}\n",
            downloaded_count, override_count
        )
    } else {
        "pack downloaded but not unpacked automatically for this source/format.\n".to_string()
    };

    fs::write(instance_dir.join(&pack_file_name), pack_bytes).map_err(|e| e.to_string())?;
    fs::write(instance_dir.join("modpack_install_report.txt"), install_report).map_err(|e| e.to_string())?;

    let instance_file = instance_dir.join("instance.json");
    let content = serde_json::to_string_pretty(&instance).map_err(|e| e.to_string())?;
    fs::write(&instance_file, content).map_err(|e| e.to_string())?;

    Ok(instance)
}

#[tauri::command]
pub async fn marketplace_search_resourcepacks(
    query: String,
    source: Option<String>,
    game_version: Option<String>,
) -> Result<Vec<MarketplacePack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let mut out: Vec<MarketplacePack> = Vec::new();
    let source_mode = source.unwrap_or_else(|| "all".to_string()).to_ascii_lowercase();
    let version_value = game_version.unwrap_or_else(|| "1.21.1".to_string());

    if source_mode == "all" || source_mode == "modrinth" {
        let facets = format!("[[\"project_type:resourcepack\"],[\"versions:{}\"]]", version_value);
        let modrinth_url = format!(
            "https://api.modrinth.com/v2/search?query={}&limit=30&facets={}",
            urlencoding::encode(q),
            urlencoding::encode(&facets)
        );
        let res = client
            .get(modrinth_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
            if let Some(hits) = body.get("hits").and_then(|v| v.as_array()) {
                for hit in hits {
                    let available_versions = hit
                        .get("versions")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();
                    out.push(MarketplacePack {
                        id: hit.get("project_id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                        source: "modrinth".to_string(),
                        title: hit.get("title").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                        description: hit.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        icon_url: hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        author: hit.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                        available_versions,
                        supported_loaders: vec![],
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let curse_api_key = env::var("CURSEFORGE_API_KEY").ok();
        if let Some(api_key) = curse_api_key {
            let curse_url = format!(
                "https://api.curseforge.com/v1/mods/search?gameId=432&classId=12&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc&gameVersion={}",
                urlencoding::encode(q),
                urlencoding::encode(&version_value)
            );
            let res = client
                .get(curse_url)
                .header("x-api-key", api_key)
                .send()
                .await
                .map_err(|e| e.to_string())?;

            if res.status().is_success() {
                let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
                if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
                    for item in items {
                        let available_versions = item
                            .get("latestFilesIndexes")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|idx| idx.get("gameVersion").and_then(|v| v.as_str()).map(|s| s.to_string()))
                                    .collect::<Vec<String>>()
                            })
                            .unwrap_or_default();

                        out.push(MarketplacePack {
                            id: item.get("id").and_then(|v| v.as_i64()).unwrap_or_default().to_string(),
                            source: "curseforge".to_string(),
                            title: item.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
                            description: item.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            icon_url: item.get("logo").and_then(|v| v.get("thumbnailUrl")).and_then(|v| v.as_str()).map(|s| s.to_string()),
                            author: item
                                .get("authors")
                                .and_then(|v| v.as_array())
                                .and_then(|arr| arr.first())
                                .and_then(|a| a.get("name"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            downloads: item.get("downloadCount").and_then(|v| v.as_f64()).unwrap_or(0.0) as u64,
                            available_versions,
                            supported_loaders: vec![],
                        });
                    }
                }
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn marketplace_install_resourcepack(
    app: AppHandle,
    instance_id: String,
    source: String,
    project_id: String,
    game_version: Option<String>,
) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let version_value = game_version.unwrap_or_else(|| "1.21.1".to_string());
    let source_mode = source.to_ascii_lowercase();
    let client = reqwest::Client::new();
    let resourcepacks_dir = instance_dir.join("resourcepacks");
    fs::create_dir_all(&resourcepacks_dir).map_err(|e| e.to_string())?;

    if source_mode == "modrinth" {
        let versions_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
        let versions: Vec<ModrinthVersion> = client
            .get(versions_url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let matching = versions
            .into_iter()
            .find(|v| v.game_versions.iter().any(|g| g == &version_value))
            .ok_or_else(|| format!("No compatible Modrinth resource pack file for {}", version_value))?;

        let file = matching
            .files
            .iter()
            .find(|f| f.primary.unwrap_or(false))
            .or_else(|| matching.files.first())
            .ok_or_else(|| "No downloadable resource pack file found.".to_string())?;

        let bytes = client
            .get(&file.url)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        if !is_valid_pack_file(&bytes, &file.filename) {
            return Err("Downloaded resource pack file is invalid.".into());
        }

        let target = resourcepacks_dir.join(&file.filename);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file.filename.clone());
    }

    if source_mode == "curseforge" {
        let api_key = env::var("CURSEFORGE_API_KEY")
            .map_err(|_| "CurseForge API key missing. Set CURSEFORGE_API_KEY in your environment.".to_string())?;

        let files_url = format!(
            "https://api.curseforge.com/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            project_id,
            urlencoding::encode(&version_value)
        );
        let files_res = client
            .get(files_url)
            .header("x-api-key", api_key)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;

        let body: serde_json::Value = files_res.json().await.map_err(|e| e.to_string())?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable").and_then(|v| v.as_bool()).unwrap_or(true)
                    && {
                        let n = row.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_ascii_lowercase();
                        n.ends_with(".zip") || n.ends_with(".jar")
                    }
            })
            .ok_or("No downloadable CurseForge resource pack file found.")?;

        let download_url = file
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("CurseForge did not provide a direct download URL for this file.")?;
        let file_name = file
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("resourcepack.zip")
            .to_string();

        let bytes = client
            .get(download_url)
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .bytes()
            .await
            .map_err(|e| e.to_string())?;

        if !is_valid_pack_file(&bytes, &file_name) {
            return Err("Downloaded resource pack file is invalid.".into());
        }

        let target = resourcepacks_dir.join(&file_name);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }

    Err("Unsupported source. Use modrinth or curseforge.".into())
}
