use crate::paths::paths_get;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::env;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::AppHandle;

const FEATURED_OVERDRIVE_ID: &str = "bloom-performance-overdrive";
const FEATURED_OVERDRIVE_NAME: &str = "Bloom Preformance | Overdrive";
const FEATURED_OVERDRIVE_MRPACK_NAME: &str = "bloom-performance-overdrive.mrpack";
const FEATURED_OVERDRIVE_MRPACK_BYTES: &[u8] =
    include_bytes!("../resources/modpacks/bloom-performance-overdrive.mrpack");

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String, // "vanilla" | "fabric"
    #[serde(default = "default_instance_renderer")]
    pub renderer: String, // "opengl" | "vulkan"
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

fn strip_instance_media(mut instance: Instance) -> Instance {
    instance.cover_data_url = None;
    instance
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
    pub icon_url: Option<String>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct InstalledModMeta {
    icon_url: Option<String>,
    source: Option<String>,
    project_id: Option<String>,
    title: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceContentFile {
    pub file_name: String,
    pub display_name: String,
    pub size_bytes: u64,
    pub updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceExplorerEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub child_count: u64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceFileTextReadResult {
    pub relative_path: String,
    pub text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceTransferOptions {
    pub include_options: bool,
    pub include_server_data: bool,
    pub include_config: bool,
    pub include_resourcepacks: bool,
    pub include_shaderpacks: bool,
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

fn default_instance_renderer() -> String {
    "opengl".to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceInstallModResult {
    pub file_name: String,
    pub dependencies_installed: usize,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersion {
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthFile>,
    #[serde(default)]
    pub dependencies: Vec<ModrinthVersionDependency>,
}

#[derive(Debug, Deserialize)]
struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct ModrinthVersionDependency {
    pub project_id: Option<String>,
    pub dependency_type: Option<String>,
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BloomExportOptions {
    pub include_mods: bool,
    pub include_resourcepacks: bool,
    pub include_shaderpacks: bool,
    pub include_config: bool,
    pub include_options: bool,
    pub include_server_data: bool,
    pub include_saves: bool,
    pub include_screenshots: bool,
    pub include_logs: bool,
    pub include_all_files: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BloomPackManifest {
    format_version: u32,
    exported_at: i64,
    source: String,
    original_instance_id: String,
    export_options: BloomExportOptions,
    instance: Instance,
    files: Vec<String>,
}

const BLOOM_PACK_MANIFEST_NAME: &str = "bloom.modpack.json";
const BLOOM_PACK_PAYLOAD_DIR: &str = "payload";
const INSTANCE_EXPORT_OPTION_FILES: &[&str] = &[
    "options.txt",
    "optionsof.txt",
    "optionsshaders.txt",
    "options.amecsapi.txt",
    "options.amecsapi-hotkeys.txt",
];

fn is_valid_jar(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

fn is_valid_pack_file(bytes: &[u8], file_name: &str) -> bool {
    let lowered = file_name.to_ascii_lowercase();
    let is_supported_ext =
        lowered.ends_with(".jar")
            || lowered.ends_with(".zip")
            || lowered.ends_with(".mrpack")
            || lowered.ends_with(".bloom");
    is_supported_ext && bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

fn is_allowed_content_file(file_name: &str, allowed_exts: &[&str]) -> bool {
    let safe_name = Path::new(file_name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if safe_name != file_name || safe_name.is_empty() {
        return false;
    }

    let lowered = safe_name.to_ascii_lowercase();
    allowed_exts.iter().any(|ext| lowered.ends_with(ext))
}

fn list_instance_content_files(
    instance_dir: &Path,
    folder_name: &str,
    allowed_exts: &[&str],
) -> Result<Vec<InstanceContentFile>, String> {
    let content_dir = instance_dir.join(folder_name);
    fs::create_dir_all(&content_dir).map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    let entries = fs::read_dir(&content_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = match path.file_name().and_then(|value| value.to_str()) {
            Some(name) if is_allowed_content_file(name, allowed_exts) => name.to_string(),
            _ => continue,
        };

        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let updated_at = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        files.push(InstanceContentFile {
            file_name: file_name.clone(),
            display_name: file_name,
            size_bytes: meta.len(),
            updated_at,
        });
    }

    files.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(files)
}

fn remove_instance_content_file(
    instance_dir: &Path,
    folder_name: &str,
    file_name: &str,
    allowed_exts: &[&str],
) -> Result<(), String> {
    if !is_allowed_content_file(file_name, allowed_exts) {
        return Err("Invalid file name.".into());
    }

    let target = instance_dir.join(folder_name).join(file_name);
    if !target.exists() {
        return Err("File not found.".into());
    }

    fs::remove_file(target).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_default_instance(
    id: String,
    name: String,
    mc_version: String,
    loader: String,
) -> Instance {
    Instance {
        id,
        name,
        mc_version,
        loader,
        renderer: default_instance_renderer(),
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

fn read_env_trimmed(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_build_env_trimmed(name: &str) -> Option<String> {
    match name {
        "BLOOM_CURSEFORGE_RELAY_URL" => option_env!("BLOOM_CURSEFORGE_RELAY_URL"),
        "BLOOM_SUPABASE_URL" => option_env!("BLOOM_SUPABASE_URL"),
        _ => None,
    }
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
}

fn configured_supabase_origin() -> Option<String> {
    let raw = read_env_trimmed("BLOOM_SUPABASE_URL")
        .or_else(|| read_build_env_trimmed("BLOOM_SUPABASE_URL"))?;

    match reqwest::Url::parse(&raw) {
        Ok(parsed) => {
            let host = parsed.host_str()?;
            let port = parsed
                .port()
                .map(|value| format!(":{value}"))
                .unwrap_or_default();
            Some(format!("{}://{}{}", parsed.scheme(), host, port))
        }
        Err(_) => Some(raw.trim_end_matches('/').to_string()),
    }
}

fn resolve_curseforge_relay_url() -> String {
    read_env_trimmed("BLOOM_CURSEFORGE_RELAY_URL")
        .or_else(|| read_build_env_trimmed("BLOOM_CURSEFORGE_RELAY_URL"))
        .or_else(|| {
            configured_supabase_origin()
                .map(|origin| format!("{}/functions/v1/main/curseforge", origin.trim_end_matches('/')))
        })
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_string()
}

async fn curseforge_get_json(
    client: &reqwest::Client,
    direct_path: &str,
    relay_path: &str,
) -> Result<serde_json::Value, String> {
    if let Some(api_key) = read_env_trimmed("CURSEFORGE_API_KEY") {
        return client
            .get(format!("https://api.curseforge.com{}", direct_path))
            .header("x-api-key", api_key)
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string());
    }

    let relay_url = resolve_curseforge_relay_url();
    if relay_url.is_empty() {
        return Err("CurseForge relay is not configured.".to_string());
    }

    let mut request = client
        .get(format!("{}{}", relay_url, relay_path))
        .header("User-Agent", "BloomClient/0.1.0");

    if let Some(shared_key) = read_env_trimmed("BLOOM_RELAY_SHARED_KEY") {
        request = request.header("x-bloom-relay-key", shared_key);
    }

    request
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())
}

fn load_instance_from_dir(instance_dir: &Path) -> Result<Instance, String> {
    let content = fs::read_to_string(instance_dir.join("instance.json")).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
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

fn normalize_relative_path(input: &str) -> Result<String, String> {
    let trimmed = input.trim().replace('\\', "/");
    if trimmed.is_empty() || trimmed == "." {
        return Ok(String::new());
    }
    let rel = Path::new(&trimmed);
    if rel.is_absolute() {
        return Err("Absolute paths are not allowed.".into());
    }

    let mut out: Vec<String> = Vec::new();
    for component in rel.components() {
        match component {
            Component::Normal(part) => {
                let name = part
                    .to_str()
                    .ok_or("Invalid UTF-8 path segment.")?
                    .trim()
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                out.push(name);
            }
            Component::CurDir => {}
            _ => return Err("Unsafe relative path.".into()),
        }
    }
    Ok(out.join("/"))
}

fn metadata_unix_seconds(meta: &fs::Metadata) -> (i64, i64) {
    let created_at = meta
        .created()
        .ok()
        .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let updated_at = meta
        .modified()
        .ok()
        .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    (created_at, updated_at)
}

fn count_direct_children(path: &Path) -> u64 {
    fs::read_dir(path)
        .ok()
        .map(|iter| iter.filter_map(Result::ok).count() as u64)
        .unwrap_or(0)
}

fn push_instance_tree_entries(
    base_dir: &Path,
    current_relative: &str,
    query_lower: &str,
    out: &mut Vec<InstanceExplorerEntry>,
) -> Result<(), String> {
    let current_dir = if current_relative.is_empty() {
        base_dir.to_path_buf()
    } else {
        safe_join_relative(base_dir, current_relative).ok_or("Invalid path.")?
    };
    if !current_dir.exists() || !current_dir.is_dir() {
        return Ok(());
    }

    let mut rows: Vec<(String, PathBuf, fs::Metadata)> = Vec::new();
    for row in fs::read_dir(&current_dir).map_err(|e| e.to_string())? {
        let row = row.map_err(|e| e.to_string())?;
        let path = row.path();
        let name = row
            .file_name()
            .to_str()
            .ok_or("Invalid UTF-8 path.")?
            .to_string();
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        rows.push((name, path, meta));
    }

    rows.sort_by(|a, b| {
        if a.2.is_dir() != b.2.is_dir() {
            return b.2.is_dir().cmp(&a.2.is_dir());
        }
        a.0.to_ascii_lowercase().cmp(&b.0.to_ascii_lowercase())
    });

    for (name, path, meta) in rows {
        let rel = if current_relative.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", current_relative, name)
        };
        let name_matches = query_lower.is_empty() || name.to_ascii_lowercase().contains(query_lower);
        let is_dir = meta.is_dir();
        let (created_at, updated_at) = metadata_unix_seconds(&meta);
        if name_matches {
            out.push(InstanceExplorerEntry {
                name: name.clone(),
                relative_path: rel.clone(),
                is_dir,
                size_bytes: if is_dir { 0 } else { meta.len() },
                child_count: if is_dir { count_direct_children(&path) } else { 0 },
                created_at,
                updated_at,
            });
        }
        if is_dir {
            push_instance_tree_entries(base_dir, &rel, query_lower, out)?;
        }
    }
    Ok(())
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

fn write_instance_to_dir(instance_dir: &Path, instance: &Instance) -> Result<(), String> {
    let instance_file = instance_dir.join("instance.json");
    let content = serde_json::to_string_pretty(instance).map_err(|e| e.to_string())?;
    fs::write(&instance_file, content).map_err(|e| e.to_string())
}

fn push_recursive_files(
    root: &Path,
    relative_dir: &str,
    out: &mut Vec<String>,
) -> Result<(), String> {
    let dir = root.join(relative_dir);
    if !dir.exists() || !dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry
            .file_name()
            .to_str()
            .ok_or("Invalid UTF-8 path in instance files.")?
            .to_string();
        let rel = if relative_dir.is_empty() {
            name
        } else {
            format!("{}/{}", relative_dir, name)
        };
        if path.is_dir() {
            push_recursive_files(root, &rel, out)?;
        } else if path.is_file() {
            out.push(rel);
        }
    }
    Ok(())
}

fn collect_bloom_export_files(
    instance_dir: &Path,
    options: &BloomExportOptions,
) -> Result<Vec<String>, String> {
    let mut files = Vec::new();

    if options.include_all_files {
        push_recursive_files(instance_dir, "", &mut files)?;
        files.retain(|path| {
            path != "instance.json"
                && path != BLOOM_PACK_MANIFEST_NAME
                && !path.ends_with(".bloom")
        });
        files.sort();
        files.dedup();
        return Ok(files);
    }

    if options.include_mods {
        push_recursive_files(instance_dir, "mods", &mut files)?;
    }
    if options.include_resourcepacks {
        push_recursive_files(instance_dir, "resourcepacks", &mut files)?;
    }
    if options.include_shaderpacks {
        push_recursive_files(instance_dir, "shaderpacks", &mut files)?;
    }
    if options.include_config {
        push_recursive_files(instance_dir, "config", &mut files)?;
    }
    if options.include_server_data {
        push_recursive_files(instance_dir, "servers", &mut files)?;
        let server_dat = instance_dir.join("servers.dat");
        if server_dat.is_file() {
            files.push("servers.dat".to_string());
        }
    }
    if options.include_saves {
        push_recursive_files(instance_dir, "saves", &mut files)?;
    }
    if options.include_screenshots {
        push_recursive_files(instance_dir, "screenshots", &mut files)?;
    }
    if options.include_logs {
        push_recursive_files(instance_dir, "logs", &mut files)?;
        let latest_log = instance_dir.join("latest.log");
        if latest_log.is_file() {
            files.push("latest.log".to_string());
        }
    }
    if options.include_options {
        for name in INSTANCE_EXPORT_OPTION_FILES {
            if instance_dir.join(name).is_file() {
                files.push((*name).to_string());
            }
        }
    }

    files.sort();
    files.dedup();
    Ok(files)
}

fn import_bloom_archive(
    instance_dir: &Path,
    pack_bytes: &[u8],
    source_path: &Path,
    requested_name: Option<String>,
) -> Result<Instance, String> {
    let cursor = Cursor::new(pack_bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid .bloom archive: {}", e))?;

    let mut manifest_entry = archive
        .by_name(BLOOM_PACK_MANIFEST_NAME)
        .map_err(|_| "This .bloom archive is missing bloom.modpack.json".to_string())?;
    let mut manifest_raw = String::new();
    manifest_entry
        .read_to_string(&mut manifest_raw)
        .map_err(|e| format!("Failed reading bloom.modpack.json: {}", e))?;
    drop(manifest_entry);

    let manifest: BloomPackManifest = serde_json::from_str(&manifest_raw)
        .map_err(|e| format!("Invalid bloom.modpack.json: {}", e))?;
    if manifest.format_version != 1 {
        return Err(format!(
            "Unsupported .bloom format version {}.",
            manifest.format_version
        ));
    }

    let mut instance = manifest.instance.clone();
    let folder_name = instance_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid instance destination.")?
        .to_string();
    instance.id = folder_name;
    let imported_name = build_import_instance_name(source_path, requested_name);
    instance.name = if imported_name.trim().is_empty() {
        manifest.instance.name.clone()
    } else {
        imported_name
    };
    instance.created_at = chrono_now_millis();
    instance.updated_at = chrono_now_millis();

    fs::create_dir_all(instance_dir).map_err(|e| e.to_string())?;

    for rel in &manifest.files {
        let archive_path = format!("{}/{}", BLOOM_PACK_PAYLOAD_DIR, rel);
        let mut entry = archive
            .by_name(&archive_path)
            .map_err(|_| format!("Missing archive payload entry: {}", rel))?;
        let target = safe_join_relative(instance_dir, rel)
            .ok_or_else(|| format!("Blocked unsafe Bloom pack path: {}", rel))?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
    }

    fs::write(
        instance_dir.join("modpack_source.txt"),
        format!(
            "source=bloom\nfile={}\noriginal_instance_id={}\n",
            source_path.display(),
            manifest.original_instance_id
        ),
    )
    .map_err(|e| e.to_string())?;
    fs::write(
        instance_dir.join("modpack_install_report.txt"),
        format!(
            "Bloom pack import completed\nexported_at={}\nfiles_restored={}\n",
            manifest.exported_at,
            manifest.files.len()
        ),
    )
    .map_err(|e| e.to_string())?;

    write_instance_to_dir(instance_dir, &instance)?;
    Ok(instance)
}

async fn install_modrinth_mrpack_contents(
    instance_dir: &Path,
    mrpack_bytes: &[u8],
    client: &reqwest::Client,
) -> Result<(Option<String>, Option<String>, usize, usize), String> {
    let (index, override_files) = {
        let cursor = Cursor::new(mrpack_bytes);
        let mut archive =
            zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid mrpack archive: {}", e))?;

        let mut index_entry = archive
            .by_name("modrinth.index.json")
            .map_err(|_| "This .mrpack is missing modrinth.index.json".to_string())?;
        let mut index_str = String::new();
        index_entry
            .read_to_string(&mut index_str)
            .map_err(|e| format!("Failed reading modrinth.index.json: {}", e))?;
        drop(index_entry);

        let parsed_index: MrpackIndex = serde_json::from_str(&index_str)
            .map_err(|e| format!("Invalid modrinth.index.json: {}", e))?;

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

        let bytes =
            downloaded.ok_or_else(|| format!("Failed to download pack file: {}", entry.path))?;
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        downloaded_files += 1;
    }

    let fabric_loader_version = index
        .dependencies
        .as_ref()
        .and_then(|deps| deps.get("fabric-loader").cloned());
    let minecraft_version = index
        .dependencies
        .as_ref()
        .and_then(|deps| deps.get("minecraft").cloned());

    Ok((
        fabric_loader_version,
        minecraft_version,
        downloaded_files,
        override_files,
    ))
}

async fn install_pack_bytes_as_instance(
    paths_instances_dir: &Path,
    client: &reqwest::Client,
    source_mode: &str,
    source_ref: &str,
    pack_file_name: &str,
    pack_bytes: &[u8],
    title_name: String,
    game_version: String,
    loader_name: String,
) -> Result<Instance, String> {
    if !is_valid_pack_file(pack_bytes, pack_file_name) {
        return Err("Downloaded modpack file is invalid or unsupported.".into());
    }

    let id = format!(
        "pack-{}-{}",
        chrono_now_millis(),
        source_ref.chars().take(12).collect::<String>()
    );
    let mut instance = build_default_instance(id.clone(), title_name, game_version, loader_name);

    let instance_dir = paths_instances_dir.join(&id);
    fs::create_dir_all(instance_dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("resourcepacks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("shaderpacks")).map_err(|e| e.to_string())?;
    fs::write(
        instance_dir.join("modpack_source.txt"),
        format!("source={}\nproject={}\nversion={}\n", source_mode, source_ref, instance.mc_version),
    )
    .map_err(|e| e.to_string())?;

    let lower_file_name = pack_file_name.to_ascii_lowercase();
    let install_report = if lower_file_name.ends_with(".mrpack") {
        let (fabric_loader, minecraft_version, downloaded_count, override_count) =
            install_modrinth_mrpack_contents(&instance_dir, pack_bytes, client).await?;
        if fabric_loader.is_some() {
            instance.fabric_loader_version = fabric_loader;
        }
        if let Some(version) = minecraft_version {
            instance.mc_version = version;
        }
        format!(
            "mrpack install completed\ndownloaded_files={}\noverrides_extracted={}\n",
            downloaded_count, override_count
        )
    } else {
        "pack downloaded but not unpacked automatically for this source/format.\n".to_string()
    };

    fs::write(instance_dir.join(pack_file_name), pack_bytes).map_err(|e| e.to_string())?;
    fs::write(instance_dir.join("modpack_install_report.txt"), install_report)
        .map_err(|e| e.to_string())?;

    write_instance_to_dir(&instance_dir, &instance)?;
    Ok(instance)
}

fn build_import_instance_name(file_path: &Path, override_name: Option<String>) -> String {
    if let Some(name) = override_name
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return name;
    }

    file_path
        .file_stem()
        .and_then(|v| v.to_str())
        .map(|v| v.replace(['_', '-'], " "))
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "Imported Modpack".to_string())
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
                        instances.push(strip_instance_media(inst));
                    }
                }
            }
        }
    }

    Ok(instances)
}

#[tauri::command]
pub fn instances_get(app: AppHandle, id: String) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    load_instance_from_dir(&instance_dir)
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
    use std::process::Command;
    let paths = paths_get(app)?;
    let target_dir = paths.instances.join(&id).join("mods");
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_resourcepacks_folder(app: tauri::AppHandle, id: String) -> Result<(), String> {
    use std::process::Command;
    let paths = paths_get(app)?;
    let target_dir = paths.instances.join(&id).join("resourcepacks");
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_shaderpacks_folder(app: tauri::AppHandle, id: String) -> Result<(), String> {
    use std::process::Command;
    let paths = paths_get(app)?;
    let target_dir = paths.instances.join(&id).join("shaderpacks");
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn instance_files_list(
    app: AppHandle,
    instance_id: String,
    relative_path: Option<String>,
    query: Option<String>,
) -> Result<Vec<InstanceExplorerEntry>, String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }

    let normalized_rel = normalize_relative_path(relative_path.as_deref().unwrap_or_default())?;
    let target_dir = if normalized_rel.is_empty() {
        instance_root.clone()
    } else {
        safe_join_relative(&instance_root, &normalized_rel).ok_or("Invalid path.")?
    };
    if !target_dir.exists() || !target_dir.is_dir() {
        return Err("Folder not found.".into());
    }

    let query_lower = query.unwrap_or_default().trim().to_ascii_lowercase();
    let mut entries = Vec::new();
    let rows = fs::read_dir(&target_dir).map_err(|e| e.to_string())?;
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        let path = row.path();
        let name = row
            .file_name()
            .to_str()
            .ok_or("Invalid UTF-8 path.")?
            .to_string();
        if !query_lower.is_empty() && !name.to_ascii_lowercase().contains(&query_lower) {
            continue;
        }
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let is_dir = meta.is_dir();
        let (created_at, updated_at) = metadata_unix_seconds(&meta);
        let rel = if normalized_rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", normalized_rel, name)
        };
        entries.push(InstanceExplorerEntry {
            name,
            relative_path: rel,
            is_dir,
            size_bytes: if is_dir { 0 } else { meta.len() },
            child_count: if is_dir { count_direct_children(&path) } else { 0 },
            created_at,
            updated_at,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())
    });
    Ok(entries)
}

#[tauri::command]
pub fn instance_files_tree(
    app: AppHandle,
    instance_id: String,
    query: Option<String>,
) -> Result<Vec<InstanceExplorerEntry>, String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let query_lower = query.unwrap_or_default().trim().to_ascii_lowercase();
    let mut out = Vec::new();
    push_instance_tree_entries(&instance_root, "", &query_lower, &mut out)?;
    Ok(out)
}

#[tauri::command]
pub async fn instance_files_open_path(
    app: AppHandle,
    instance_id: String,
    relative_path: Option<String>,
) -> Result<(), String> {
    use std::process::Command;
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let normalized_rel = normalize_relative_path(relative_path.as_deref().unwrap_or_default())?;
    let target = if normalized_rel.is_empty() {
        instance_root
    } else {
        safe_join_relative(&instance_root, &normalized_rel).ok_or("Invalid path.")?
    };
    if !target.exists() {
        return Err("Target path not found.".into());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn instance_files_create_directory(
    app: AppHandle,
    instance_id: String,
    parent_relative_path: Option<String>,
    name: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let folder_name = name.trim();
    if folder_name.is_empty()
        || folder_name == "."
        || folder_name == ".."
        || folder_name.contains('/')
        || folder_name.contains('\\')
    {
        return Err("Invalid folder name.".into());
    }
    let parent_rel = normalize_relative_path(parent_relative_path.as_deref().unwrap_or_default())?;
    let parent = if parent_rel.is_empty() {
        instance_root
    } else {
        safe_join_relative(&instance_root, &parent_rel).ok_or("Invalid parent path.")?
    };
    if !parent.exists() || !parent.is_dir() {
        return Err("Parent folder not found.".into());
    }
    let target = parent.join(folder_name);
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn instance_files_delete(
    app: AppHandle,
    instance_id: String,
    relative_path: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let rel = normalize_relative_path(&relative_path)?;
    if rel.is_empty() {
        return Err("Cannot delete instance root.".into());
    }
    let target = safe_join_relative(&instance_root, &rel).ok_or("Invalid path.")?;
    if !target.exists() {
        return Err("Path not found.".into());
    }
    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn instance_files_rename(
    app: AppHandle,
    instance_id: String,
    relative_path: String,
    new_name: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let rel = normalize_relative_path(&relative_path)?;
    if rel.is_empty() {
        return Err("Cannot rename instance root.".into());
    }
    let clean_name = new_name.trim();
    if clean_name.is_empty()
        || clean_name == "."
        || clean_name == ".."
        || clean_name.contains('/')
        || clean_name.contains('\\')
    {
        return Err("Invalid target name.".into());
    }
    let source = safe_join_relative(&instance_root, &rel).ok_or("Invalid path.")?;
    if !source.exists() {
        return Err("Path not found.".into());
    }
    let parent = source.parent().ok_or("Parent path unavailable.")?;
    let target = parent.join(clean_name);
    fs::rename(source, target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn instance_files_read_text(
    app: AppHandle,
    instance_id: String,
    relative_path: String,
) -> Result<InstanceFileTextReadResult, String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let rel = normalize_relative_path(&relative_path)?;
    if rel.is_empty() {
        return Err("Select a file.".into());
    }
    let target = safe_join_relative(&instance_root, &rel).ok_or("Invalid path.")?;
    if !target.exists() || !target.is_file() {
        return Err("File not found.".into());
    }
    let bytes = fs::read(&target).map_err(|e| e.to_string())?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("File is too large to edit in-app (max 2 MB).".into());
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| "File is not UTF-8 text. Use Open In System for binary files.".to_string())?;
    Ok(InstanceFileTextReadResult {
        relative_path: rel,
        text,
    })
}

#[tauri::command]
pub fn instance_files_write_text(
    app: AppHandle,
    instance_id: String,
    relative_path: String,
    text: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_root = paths.instances.join(&instance_id);
    if !instance_root.exists() {
        return Err("Instance not found".into());
    }
    let rel = normalize_relative_path(&relative_path)?;
    if rel.is_empty() {
        return Err("Select a file.".into());
    }
    let target = safe_join_relative(&instance_root, &rel).ok_or("Invalid path.")?;
    if !target.exists() || !target.is_file() {
        return Err("File not found.".into());
    }
    if text.as_bytes().len() > 2 * 1024 * 1024 {
        return Err("Edited file is too large (max 2 MB).".into());
    }
    fs::write(target, text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn instance_install_mod_files(
    app: AppHandle,
    instance_id: String,
    files: Vec<ModUpload>,
) -> Result<ModInstallResult, String> {
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
pub fn instance_install_mod_paths(
    app: AppHandle,
    instance_id: String,
    paths: Vec<String>,
) -> Result<ModInstallResult, String> {
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
pub async fn instance_install_fabric_api(
    app: AppHandle,
    instance_id: String,
) -> Result<String, String> {
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
        .ok_or_else(|| {
            format!(
                "No Fabric API build found for Minecraft {}",
                instance.mc_version
            )
        })?;

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
pub fn instance_list_mods(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<InstanceModFile>, String> {
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

        let icon_url = read_installed_mod_meta(&mods_dir, &display_name)
            .and_then(|meta| meta.icon_url)
            .or_else(|| extract_mod_icon_data_url(&path));

        mods.push(InstanceModFile {
            file_name,
            display_name,
            enabled: is_enabled,
            size_bytes: meta.len(),
            updated_at,
            icon_url,
        });
    }

    mods.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(mods)
}

#[tauri::command]
pub fn instance_list_resourcepacks(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<InstanceContentFile>, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    list_instance_content_files(&instance_dir, "resourcepacks", &[".zip", ".jar"])
}

#[tauri::command]
pub fn instance_list_shaderpacks(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<InstanceContentFile>, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    list_instance_content_files(&instance_dir, "shaderpacks", &[".zip", ".jar"])
}

fn installed_mod_meta_path(mods_dir: &Path, file_name: &str) -> PathBuf {
    mods_dir.join(format!("{}.bloommeta.json", file_name))
}

const INSTANCE_OPTIONS_TRANSFER_FILES: &[&str] = &[
    "options.txt",
    "optionsof.txt",
    "optionsshaders.txt",
    "options.amecsapi.txt",
    "options.amecsapi-hotkeys.txt",
];

fn read_installed_mod_meta(mods_dir: &Path, file_name: &str) -> Option<InstalledModMeta> {
    let path = installed_mod_meta_path(mods_dir, file_name);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_installed_mod_meta(mods_dir: &Path, file_name: &str, meta: &InstalledModMeta) -> Result<(), String> {
    let path = installed_mod_meta_path(mods_dir, file_name);
    let raw = serde_json::to_string(meta).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn maybe_move_installed_mod_meta(mods_dir: &Path, from_name: &str, to_name: &str) -> Result<(), String> {
    let current = installed_mod_meta_path(mods_dir, from_name);
    if !current.exists() {
        return Ok(());
    }
    let next = installed_mod_meta_path(mods_dir, to_name);
    fs::rename(current, next).map_err(|e| e.to_string())
}

fn maybe_delete_installed_mod_meta(mods_dir: &Path, file_name: &str) -> Result<(), String> {
    let path = installed_mod_meta_path(mods_dir, file_name);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn has_installed_project_id(mods_dir: &Path, project_id: &str) -> bool {
    let entries = match fs::read_dir(mods_dir) {
        Ok(entries) => entries,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|v| v.to_str()) else {
            continue;
        };
        if !name.ends_with(".bloommeta.json") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<InstalledModMeta>(&raw) else {
            continue;
        };
        if meta
            .project_id
            .as_ref()
            .map(|id| id == project_id)
            .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

async fn install_modrinth_mod_with_required_dependencies(
    instance: &Instance,
    mods_dir: &Path,
    project_id: &str,
) -> Result<(String, InstalledModMeta, usize), String> {
    let loader = instance.loader.to_ascii_lowercase();
    let game_version = instance.mc_version.clone();
    let client = reqwest::Client::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();
    queue.push_back(project_id.to_string());
    let mut root_result: Option<(String, InstalledModMeta)> = None;
    let mut installed_count: usize = 0;

    while let Some(current_project_id) = queue.pop_front() {
        if !visited.insert(current_project_id.clone()) {
            continue;
        }
        if has_installed_project_id(mods_dir, &current_project_id) {
            continue;
        }

        let versions_url = format!(
            "https://api.modrinth.com/v2/project/{}/version",
            current_project_id
        );
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
            .ok_or_else(|| {
                format!(
                    "No compatible Modrinth file for {} {} (project {})",
                    loader, game_version, current_project_id
                )
            })?;

        for dep in &matching.dependencies {
            let is_required = dep
                .dependency_type
                .as_ref()
                .map(|value| value.eq_ignore_ascii_case("required"))
                .unwrap_or(false);
            if !is_required {
                continue;
            }
            if let Some(dep_project_id) = dep.project_id.as_ref() {
                let dep_id = dep_project_id.trim();
                if !dep_id.is_empty() && !visited.contains(dep_id) {
                    queue.push_back(dep_id.to_string());
                }
            }
        }

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
        installed_count += 1;

        let project_info: serde_json::Value = client
            .get(format!(
                "https://api.modrinth.com/v2/project/{}",
                current_project_id
            ))
            .header("User-Agent", "BloomClient/0.1.0")
            .send()
            .await
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;

        let meta = InstalledModMeta {
            icon_url: project_info
                .get("icon_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            source: Some("modrinth".to_string()),
            project_id: Some(current_project_id.clone()),
            title: project_info
                .get("title")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        };
        let _ = write_installed_mod_meta(mods_dir, &file.filename, &meta);

        if current_project_id == project_id {
            root_result = Some((file.filename.clone(), meta));
        }
    }

    root_result
        .map(|(file_name, meta)| (file_name, meta, installed_count.saturating_sub(1)))
        .ok_or_else(|| "No compatible Modrinth file for the selected mod.".to_string())
}

async fn install_curseforge_mod_with_required_dependencies(
    instance: &Instance,
    mods_dir: &Path,
    project_id: &str,
) -> Result<(String, InstalledModMeta, usize), String> {
    let game_version = instance.mc_version.clone();
    let client = reqwest::Client::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    let mut visited: HashSet<String> = HashSet::new();
    queue.push_back(project_id.to_string());
    let mut root_result: Option<(String, InstalledModMeta)> = None;
    let mut installed_count: usize = 0;

    while let Some(current_project_id) = queue.pop_front() {
        if !visited.insert(current_project_id.clone()) {
            continue;
        }
        if has_installed_project_id(mods_dir, &current_project_id) {
            continue;
        }

        let files_query = format!(
            "/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            current_project_id,
            urlencoding::encode(&game_version)
        );
        let body: serde_json::Value = curseforge_get_json(
            &client,
            &files_query,
            &format!(
                "/mods/{}/files?gameVersion={}&pageSize=40&index=0",
                current_project_id,
                urlencoding::encode(&game_version)
            ),
        )
        .await?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                    && row
                        .get("fileName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .ends_with(".jar")
            })
            .ok_or_else(|| {
                format!(
                    "No downloadable CurseForge jar file found for project {}.",
                    current_project_id
                )
            })?;

        if let Some(deps) = file.get("dependencies").and_then(|v| v.as_array()) {
            for dep in deps {
                let relation_type = dep
                    .get("relationType")
                    .and_then(|v| v.as_i64())
                    .unwrap_or_default();
                if relation_type != 3 {
                    continue;
                }
                if let Some(dep_id) = dep.get("modId").and_then(|v| v.as_i64()) {
                    let dep_project_id = dep_id.to_string();
                    if !visited.contains(&dep_project_id) {
                        queue.push_back(dep_project_id);
                    }
                }
            }
        }

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
        installed_count += 1;

        let mod_info: serde_json::Value = curseforge_get_json(
            &client,
            &format!("/v1/mods/{}", current_project_id),
            &format!("/mods/{}", current_project_id),
        )
        .await?;
        let meta = InstalledModMeta {
            icon_url: mod_info
                .get("data")
                .and_then(|v| v.get("logo"))
                .and_then(|v| v.get("url"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            source: Some("curseforge".to_string()),
            project_id: Some(current_project_id.clone()),
            title: mod_info
                .get("data")
                .and_then(|v| v.get("name"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        };
        let _ = write_installed_mod_meta(mods_dir, &file_name, &meta);

        if current_project_id == project_id {
            root_result = Some((file_name, meta));
        }
    }

    root_result
        .map(|(file_name, meta)| (file_name, meta, installed_count.saturating_sub(1)))
        .ok_or_else(|| "No compatible CurseForge file for the selected mod.".to_string())
}

fn extract_mod_icon_data_url(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    let cursor = Cursor::new(bytes);
    let mut zip = zip::ZipArchive::new(cursor).ok()?;
    let mut fabric_meta = zip.by_name("fabric.mod.json").ok()?;
    let mut raw = String::new();
    fabric_meta.read_to_string(&mut raw).ok()?;
    drop(fabric_meta);

    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let icon_path = json
        .get("icon")
        .and_then(|value| value.as_str().map(str::to_string))
        .or_else(|| {
            json.get("icon")
                .and_then(|value| value.as_object())
                .and_then(|map| {
                    map.get("128")
                        .or_else(|| map.get("64"))
                        .or_else(|| map.values().next())
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                })
        })?;

    let mut icon_file = zip.by_name(&icon_path).ok()?;
    let mut image = Vec::new();
    icon_file.read_to_end(&mut image).ok()?;

    let mime = if icon_path.to_ascii_lowercase().ends_with(".png") {
        "image/png"
    } else if icon_path.to_ascii_lowercase().ends_with(".jpg") || icon_path.to_ascii_lowercase().ends_with(".jpeg") {
        "image/jpeg"
    } else {
        "image/png"
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(image);
    Some(format!("data:{};base64,{}", mime, encoded))
}

async fn install_marketplace_mod_into_instance(
    instance: &Instance,
    mods_dir: &Path,
    source: &str,
    project_id: &str,
) -> Result<(String, InstalledModMeta, usize), String> {
    let source_mode = source.to_ascii_lowercase();

    if source_mode == "modrinth" {
        return install_modrinth_mod_with_required_dependencies(instance, mods_dir, project_id)
            .await;
    }

    if source_mode == "curseforge" {
        return install_curseforge_mod_with_required_dependencies(instance, mods_dir, project_id)
            .await;
    }

    Err("Unsupported source. Use modrinth or curseforge.".into())
}

#[tauri::command]
pub fn instance_toggle_mod(
    app: AppHandle,
    instance_id: String,
    file_name: String,
    enabled: bool,
) -> Result<String, String> {
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
    maybe_move_installed_mod_meta(&mods_dir, &file_name, &next_name)?;
    Ok(next_name)
}

#[tauri::command]
pub fn instance_disable_incompatible_mods(
    app: AppHandle,
    instance_id: String,
) -> Result<Vec<String>, String> {
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
        maybe_move_installed_mod_meta(&mods_dir, &file_name, &new_name)?;
        disabled.push(file_name);
    }

    Ok(disabled)
}

#[tauri::command]
pub fn instance_delete_mod(
    app: AppHandle,
    instance_id: String,
    file_name: String,
) -> Result<(), String> {
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
    maybe_delete_installed_mod_meta(&mods_dir, &file_name)?;
    Ok(())
}

#[tauri::command]
pub fn instance_delete_resourcepack(
    app: AppHandle,
    instance_id: String,
    file_name: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    remove_instance_content_file(
        &instance_dir,
        "resourcepacks",
        &file_name,
        &[".zip", ".jar"],
    )
}

#[tauri::command]
pub fn instance_delete_shaderpack(
    app: AppHandle,
    instance_id: String,
    file_name: String,
) -> Result<(), String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    remove_instance_content_file(&instance_dir, "shaderpacks", &file_name, &[".zip", ".jar"])
}

#[tauri::command]
pub fn instance_copy_game_options(
    app: AppHandle,
    source_instance_id: String,
    target_instance_id: String,
) -> Result<String, String> {
    instance_transfer_files(
        app,
        source_instance_id,
        target_instance_id,
        InstanceTransferOptions {
            include_options: true,
            include_server_data: false,
            include_config: false,
            include_resourcepacks: false,
            include_shaderpacks: false,
        },
    )
}

#[tauri::command]
pub fn instance_transfer_files(
    app: AppHandle,
    source_instance_id: String,
    target_instance_id: String,
    options: InstanceTransferOptions,
) -> Result<String, String> {
    if source_instance_id == target_instance_id {
        return Err("Choose a different source instance before importing files.".into());
    }

    if !options.include_options
        && !options.include_server_data
        && !options.include_config
        && !options.include_resourcepacks
        && !options.include_shaderpacks
    {
        return Err("Choose at least one file group to transfer.".into());
    }

    let paths = paths_get(app)?;
    let source_dir = paths.instances.join(&source_instance_id);
    let target_dir = paths.instances.join(&target_instance_id);

    if !source_dir.exists() {
        return Err("Source instance not found.".into());
    }
    if !target_dir.exists() {
        return Err("Target instance not found.".into());
    }

    let mut copied: Vec<String> = Vec::new();

    if options.include_options {
        for file_name in INSTANCE_OPTIONS_TRANSFER_FILES {
            let source = source_dir.join(file_name);
            if !source.exists() || !source.is_file() {
                continue;
            }

            let target = target_dir.join(file_name);
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "Failed copying {} from {} to {}: {}",
                    file_name, source_instance_id, target_instance_id, e
                )
            })?;
            copied.push((*file_name).to_string());
        }
    }

    if options.include_server_data {
        let source_server_dat = source_dir.join("servers.dat");
        if source_server_dat.is_file() {
            let target_server_dat = target_dir.join("servers.dat");
            fs::copy(&source_server_dat, &target_server_dat).map_err(|e| {
                format!(
                    "Failed copying servers.dat from {} to {}: {}",
                    source_instance_id, target_instance_id, e
                )
            })?;
            copied.push("servers.dat".to_string());
        }

        let mut server_files = Vec::new();
        push_recursive_files(&source_dir, "servers", &mut server_files)?;
        for rel in server_files {
            let source = safe_join_relative(&source_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe server data path: {}", rel))?;
            let target = safe_join_relative(&target_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe target server data path: {}", rel))?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "Failed copying {} from {} to {}: {}",
                    rel, source_instance_id, target_instance_id, e
                )
            })?;
            copied.push(rel);
        }
    }

    if options.include_config {
        let mut config_files = Vec::new();
        push_recursive_files(&source_dir, "config", &mut config_files)?;
        for rel in config_files {
            let source = safe_join_relative(&source_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe config path: {}", rel))?;
            let target = safe_join_relative(&target_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe target config path: {}", rel))?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "Failed copying {} from {} to {}: {}",
                    rel, source_instance_id, target_instance_id, e
                )
            })?;
            copied.push(rel);
        }
    }

    if options.include_resourcepacks {
        let mut resourcepack_files = Vec::new();
        push_recursive_files(&source_dir, "resourcepacks", &mut resourcepack_files)?;
        for rel in resourcepack_files {
            let source = safe_join_relative(&source_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe resource pack path: {}", rel))?;
            let target = safe_join_relative(&target_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe target resource pack path: {}", rel))?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "Failed copying {} from {} to {}: {}",
                    rel, source_instance_id, target_instance_id, e
                )
            })?;
            copied.push(rel);
        }
    }

    if options.include_shaderpacks {
        let mut shaderpack_files = Vec::new();
        push_recursive_files(&source_dir, "shaderpacks", &mut shaderpack_files)?;
        for rel in shaderpack_files {
            let source = safe_join_relative(&source_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe shader pack path: {}", rel))?;
            let target = safe_join_relative(&target_dir, &rel)
                .ok_or_else(|| format!("Blocked unsafe target shader pack path: {}", rel))?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&source, &target).map_err(|e| {
                format!(
                    "Failed copying {} from {} to {}: {}",
                    rel, source_instance_id, target_instance_id, e
                )
            })?;
            copied.push(rel);
        }
    }

    if copied.is_empty() {
        return Err("No matching transfer files were found in the source instance.".into());
    }

    Ok(format!(
        "Transferred {} file(s): {}",
        copied.len(),
        copied.join(", ")
    ))
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
    let source_mode = source
        .unwrap_or_else(|| "all".to_string())
        .to_ascii_lowercase();
    let loader_value = loader
        .unwrap_or_else(|| "fabric".to_string())
        .to_ascii_lowercase();
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
                        id: hit
                            .get("project_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        source: "modrinth".to_string(),
                        title: hit
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        description: hit
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        icon_url: hit
                            .get("icon_url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        author: hit
                            .get("author")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let curse_query = format!(
            "gameId=432&classId=6&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc&gameVersion={}",
            urlencoding::encode(q),
            urlencoding::encode(&version_value)
        );
        let body: serde_json::Value = curseforge_get_json(
            &client,
            &format!("/v1/mods/search?{}", curse_query),
            &format!("/mods/search?{}", curse_query),
        )
        .await?;
        if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
            for item in items {
                out.push(MarketplaceMod {
                    id: item
                        .get("id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default()
                        .to_string(),
                    source: "curseforge".to_string(),
                    title: item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    description: item
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    icon_url: item
                        .get("logo")
                        .and_then(|v| v.get("thumbnailUrl"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    author: item
                        .get("authors")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|a| a.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    downloads: item
                        .get("downloadCount")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0) as u64,
                });
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
) -> Result<MarketplaceInstallModResult, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let instance = load_instance_from_dir(&instance_dir)?;
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;
    let (file_name, _, dependencies_installed) =
        install_marketplace_mod_into_instance(&instance, &mods_dir, &source, &project_id).await?;
    Ok(MarketplaceInstallModResult {
        file_name,
        dependencies_installed,
    })
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
    let source_mode = source
        .unwrap_or_else(|| "all".to_string())
        .to_ascii_lowercase();

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
                                .filter(|s| {
                                    s == "fabric" || s == "forge" || s == "quilt" || s == "neoforge"
                                })
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();

                    out.push(MarketplacePack {
                        id: hit
                            .get("project_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        source: "modrinth".to_string(),
                        title: hit
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        description: hit
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        icon_url: hit
                            .get("icon_url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        author: hit
                            .get("author")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                        available_versions,
                        supported_loaders,
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let curse_query = format!(
            "gameId=432&classId=4471&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc",
            urlencoding::encode(q)
        );
        let body: serde_json::Value = curseforge_get_json(
            &client,
            &format!("/v1/mods/search?{}", curse_query),
            &format!("/mods/search?{}", curse_query),
        )
        .await?;
        if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
            for item in items {
                let available_versions = item
                    .get("latestFilesIndexes")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|idx| {
                                idx.get("gameVersion")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect::<Vec<String>>()
                    })
                    .unwrap_or_default();

                out.push(MarketplacePack {
                    id: item
                        .get("id")
                        .and_then(|v| v.as_i64())
                        .unwrap_or_default()
                        .to_string(),
                    source: "curseforge".to_string(),
                    title: item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown")
                        .to_string(),
                    description: item
                        .get("summary")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    icon_url: item
                        .get("logo")
                        .and_then(|v| v.get("thumbnailUrl"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    author: item
                        .get("authors")
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|a| a.get("name"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    downloads: item
                        .get("downloadCount")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0) as u64,
                    available_versions,
                    supported_loaders: vec![],
                });
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

        let selected_loader = if matching
            .loaders
            .iter()
            .any(|l| l.eq_ignore_ascii_case("fabric"))
        {
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
        let files_query = format!(
            "/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            project_id,
            urlencoding::encode(&game_version)
        );
        let body: serde_json::Value = curseforge_get_json(
            &client,
            &files_query,
            &format!("/mods/{}/files?gameVersion={}&pageSize=40&index=0", project_id, urlencoding::encode(&game_version)),
        )
        .await?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                    && row
                        .get("fileName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .ends_with(".zip")
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

        let mod_info: serde_json::Value = curseforge_get_json(
            &client,
            &format!("/v1/mods/{}", project_id),
            &format!("/mods/{}", project_id),
        )
        .await?;
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
    install_pack_bytes_as_instance(
        &paths.instances,
        &client,
        &source_mode,
        &project_id,
        &pack_file_name,
        &pack_bytes,
        title_name,
        game_version,
        loader_name,
    )
    .await
}

#[tauri::command]
pub async fn featured_install_modpack(
    app: AppHandle,
    featured_id: String,
) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let client = reqwest::Client::new();
    match featured_id.as_str() {
        FEATURED_OVERDRIVE_ID => {
            install_pack_bytes_as_instance(
                &paths.instances,
                &client,
                "bloom-featured",
                FEATURED_OVERDRIVE_ID,
                FEATURED_OVERDRIVE_MRPACK_NAME,
                FEATURED_OVERDRIVE_MRPACK_BYTES,
                FEATURED_OVERDRIVE_NAME.to_string(),
                "1.21.11".to_string(),
                "fabric".to_string(),
            )
            .await
        }
        _ => Err("Unknown featured modpack.".into()),
    }
}

#[tauri::command]
pub fn instance_export_bloom(
    app: AppHandle,
    instance_id: String,
    output_path: String,
    options: BloomExportOptions,
) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let instance = load_instance_from_dir(&instance_dir)?;
    let target_path = PathBuf::from(&output_path);
    if target_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| !value.eq_ignore_ascii_case("bloom"))
        .unwrap_or(true)
    {
        return Err("Bloom exports must use the .bloom extension.".into());
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let files = collect_bloom_export_files(&instance_dir, &options)?;
    let manifest = BloomPackManifest {
        format_version: 1,
        exported_at: chrono_now_millis(),
        source: "bloom-client".to_string(),
        original_instance_id: instance.id.clone(),
        export_options: options.clone(),
        instance,
        files: files.clone(),
    };

    let file = fs::File::create(&target_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let entry_options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let manifest_raw =
        serde_json::to_vec_pretty(&manifest).map_err(|e| format!("Manifest error: {}", e))?;
    zip.start_file(BLOOM_PACK_MANIFEST_NAME, entry_options)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    zip.write_all(&manifest_raw).map_err(|e| e.to_string())?;

    for rel in files {
        let source = safe_join_relative(&instance_dir, &rel)
            .ok_or_else(|| format!("Blocked unsafe instance path: {}", rel))?;
        if !source.is_file() {
            continue;
        }
        let bytes = fs::read(&source).map_err(|e| e.to_string())?;
        zip.start_file(format!("{}/{}", BLOOM_PACK_PAYLOAD_DIR, rel), entry_options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(target_path.display().to_string())
}

#[tauri::command]
pub async fn import_local_modpack_instance(
    app: AppHandle,
    file_path: String,
    game_version: String,
    instance_name: Option<String>,
) -> Result<Instance, String> {
    let paths = paths_get(app)?;
    let client = reqwest::Client::new();
    let source_path = PathBuf::from(&file_path);

    if !source_path.exists() || !source_path.is_file() {
        return Err("Selected modpack file was not found.".into());
    }

    let safe_name = source_path
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or("Invalid modpack file name.")?
        .to_string();
    let pack_bytes = fs::read(&source_path).map_err(|e| e.to_string())?;

    if !is_valid_pack_file(&pack_bytes, &safe_name) {
        return Err("Selected file is not a valid .mrpack, .bloom, or .zip modpack archive.".into());
    }

    let lower_file_name = safe_name.to_ascii_lowercase();
    let id = format!("import-{}", chrono_now_millis());
    let instance_dir = paths.instances.join(&id);

    if lower_file_name.ends_with(".bloom") {
        return import_bloom_archive(&instance_dir, &pack_bytes, &source_path, instance_name);
    }

    let mut instance = build_default_instance(
        id.clone(),
        build_import_instance_name(&source_path, instance_name),
        game_version.clone(),
        "fabric".to_string(),
    );

    fs::create_dir_all(instance_dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("resourcepacks")).map_err(|e| e.to_string())?;
    fs::create_dir_all(instance_dir.join("shaderpacks")).map_err(|e| e.to_string())?;
    fs::write(
        instance_dir.join("modpack_source.txt"),
        format!(
            "source=local\nfile={}\nversion={}\n",
            source_path.display(),
            game_version
        ),
    )
    .map_err(|e| e.to_string())?;

    let install_report = if lower_file_name.ends_with(".mrpack") {
        let (fabric_loader, minecraft_version, downloaded_count, override_count) =
            install_modrinth_mrpack_contents(&instance_dir, &pack_bytes, &client).await?;
        if fabric_loader.is_some() {
            instance.fabric_loader_version = fabric_loader;
        }
        if let Some(version) = minecraft_version {
            instance.mc_version = version;
        }
        format!(
            "local mrpack import completed\ndownloaded_files={}\noverrides_extracted={}\n",
            downloaded_count, override_count
        )
    } else {
        "local zip imported but not unpacked automatically.\n".to_string()
    };

    fs::write(instance_dir.join(&safe_name), pack_bytes).map_err(|e| e.to_string())?;
    fs::write(
        instance_dir.join("modpack_install_report.txt"),
        install_report,
    )
    .map_err(|e| e.to_string())?;

    write_instance_to_dir(&instance_dir, &instance)?;

    Ok(instance)
}

async fn fetch_curseforge_class_id(
    client: &reqwest::Client,
    slugs: &[&str],
) -> Result<Option<i64>, String> {
    let body: serde_json::Value =
        curseforge_get_json(client, "/v1/categories?gameId=432", "/categories?gameId=432").await?;
    let categories = match body.get("data").and_then(|value| value.as_array()) {
        Some(value) => value,
        None => return Ok(None),
    };

    for slug in slugs {
        if let Some(id) = categories.iter().find_map(|item| {
            let category_slug = item
                .get("slug")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let category_name = item
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            if category_slug.eq_ignore_ascii_case(slug) || category_name.eq_ignore_ascii_case(slug)
            {
                item.get("id").and_then(|value| value.as_i64())
            } else {
                None
            }
        }) {
            return Ok(Some(id));
        }
    }

    Ok(None)
}

async fn marketplace_search_packs(
    query: String,
    source: Option<String>,
    game_version: Option<String>,
    modrinth_project_type: &str,
    curseforge_class_id: Option<i64>,
    curseforge_class_slugs: &[&str],
) -> Result<Vec<MarketplacePack>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let mut out: Vec<MarketplacePack> = Vec::new();
    let source_mode = source
        .unwrap_or_else(|| "all".to_string())
        .to_ascii_lowercase();
    let version_value = game_version.unwrap_or_else(|| "1.21.1".to_string());

    if source_mode == "all" || source_mode == "modrinth" {
        let facets = format!(
            "[[\"project_type:{}\"],[\"versions:{}\"]]",
            modrinth_project_type, version_value
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
                        id: hit
                            .get("project_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        source: "modrinth".to_string(),
                        title: hit
                            .get("title")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        description: hit
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        icon_url: hit
                            .get("icon_url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        author: hit
                            .get("author")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        downloads: hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0),
                        available_versions,
                        supported_loaders: vec![],
                    });
                }
            }
        }
    }

    if source_mode == "all" || source_mode == "curseforge" {
        let resolved_class_id = match curseforge_class_id {
            Some(value) => Some(value),
            None => fetch_curseforge_class_id(&client, curseforge_class_slugs).await?,
        };

        if let Some(class_id) = resolved_class_id {
            let curse_query = format!(
                "gameId=432&classId={}&searchFilter={}&pageSize=30&sortField=2&sortOrder=desc&gameVersion={}",
                class_id,
                urlencoding::encode(q),
                urlencoding::encode(&version_value)
            );
            let body: serde_json::Value = curseforge_get_json(
                &client,
                &format!("/v1/mods/search?{}", curse_query),
                &format!("/mods/search?{}", curse_query),
            )
            .await?;
            if let Some(items) = body.get("data").and_then(|v| v.as_array()) {
                for item in items {
                    let available_versions = item
                        .get("latestFilesIndexes")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|idx| {
                                    idx.get("gameVersion")
                                        .and_then(|v| v.as_str())
                                        .map(|s| s.to_string())
                                })
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();

                    out.push(MarketplacePack {
                        id: item
                            .get("id")
                            .and_then(|v| v.as_i64())
                            .unwrap_or_default()
                            .to_string(),
                        source: "curseforge".to_string(),
                        title: item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        description: item
                            .get("summary")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        icon_url: item
                            .get("logo")
                            .and_then(|v| v.get("thumbnailUrl"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        author: item
                            .get("authors")
                            .and_then(|v| v.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|a| a.get("name"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        downloads: item
                            .get("downloadCount")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0)
                            as u64,
                        available_versions,
                        supported_loaders: vec![],
                    });
                }
            }
        }
    }

    Ok(out)
}

async fn install_marketplace_pack(
    app: AppHandle,
    instance_id: String,
    source: String,
    project_id: String,
    game_version: Option<String>,
    target_folder: &str,
    item_label: &str,
) -> Result<String, String> {
    let paths = paths_get(app)?;
    let instance_dir = paths.instances.join(&instance_id);
    if !instance_dir.exists() {
        return Err("Instance not found".into());
    }

    let version_value = game_version.unwrap_or_else(|| "1.21.1".to_string());
    let source_mode = source.to_ascii_lowercase();
    let client = reqwest::Client::new();
    let target_dir = instance_dir.join(target_folder);
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

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
            .ok_or_else(|| {
                format!(
                    "No compatible Modrinth {} file for {}",
                    item_label, version_value
                )
            })?;

        let file = matching
            .files
            .iter()
            .find(|f| f.primary.unwrap_or(false))
            .or_else(|| matching.files.first())
            .ok_or_else(|| format!("No downloadable {} file found.", item_label))?;

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
            return Err(format!("Downloaded {} file is invalid.", item_label));
        }

        let target = target_dir.join(&file.filename);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file.filename.clone());
    }

    if source_mode == "curseforge" {
        let files_query = format!(
            "/v1/mods/{}/files?gameVersion={}&pageSize=40&index=0",
            project_id,
            urlencoding::encode(&version_value)
        );
        let body: serde_json::Value = curseforge_get_json(
            &client,
            &files_query,
            &format!("/mods/{}/files?gameVersion={}&pageSize=40&index=0", project_id, urlencoding::encode(&version_value)),
        )
        .await?;
        let data = body
            .get("data")
            .and_then(|v| v.as_array())
            .ok_or("Invalid CurseForge files response.")?;

        let file = data
            .iter()
            .find(|row| {
                row.get("isAvailable")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
                    && {
                        let n = row
                            .get("fileName")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_ascii_lowercase();
                        n.ends_with(".zip") || n.ends_with(".jar")
                    }
            })
            .ok_or_else(|| format!("No downloadable CurseForge {} file found.", item_label))?;

        let download_url = file
            .get("downloadUrl")
            .and_then(|v| v.as_str())
            .ok_or("CurseForge did not provide a direct download URL for this file.")?;
        let file_name = file
            .get("fileName")
            .and_then(|v| v.as_str())
            .unwrap_or("download.zip")
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
            return Err(format!("Downloaded {} file is invalid.", item_label));
        }

        let target = target_dir.join(&file_name);
        fs::write(&target, bytes).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }

    Err("Unsupported source. Use modrinth or curseforge.".into())
}

#[tauri::command]
pub async fn marketplace_search_resourcepacks(
    query: String,
    source: Option<String>,
    game_version: Option<String>,
) -> Result<Vec<MarketplacePack>, String> {
    marketplace_search_packs(query, source, game_version, "resourcepack", Some(12), &[]).await
}

#[tauri::command]
pub async fn marketplace_install_resourcepack(
    app: AppHandle,
    instance_id: String,
    source: String,
    project_id: String,
    game_version: Option<String>,
) -> Result<String, String> {
    install_marketplace_pack(
        app,
        instance_id,
        source,
        project_id,
        game_version,
        "resourcepacks",
        "resource pack",
    )
    .await
}

#[tauri::command]
pub async fn marketplace_search_shaders(
    query: String,
    source: Option<String>,
    game_version: Option<String>,
) -> Result<Vec<MarketplacePack>, String> {
    marketplace_search_packs(
        query,
        source,
        game_version,
        "shader",
        None,
        &["shader-packs", "shaders", "shaderpacks"],
    )
    .await
}

#[tauri::command]
pub async fn marketplace_install_shaderpack(
    app: AppHandle,
    instance_id: String,
    source: String,
    project_id: String,
    game_version: Option<String>,
) -> Result<String, String> {
    install_marketplace_pack(
        app,
        instance_id,
        source,
        project_id,
        game_version,
        "shaderpacks",
        "shader pack",
    )
    .await
}
