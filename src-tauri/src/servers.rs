use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SERVER_META_FILE: &str = "server.json";
const SERVER_JAR_FILE: &str = "server.jar";
const SERVER_EULA_FILE: &str = "eula.txt";
const SERVER_PROPERTIES_FILE: &str = "server.properties";
const SERVER_LOG_LIMIT: usize = 2200;
const DEFAULT_RELAY_API_URL: &str = "https://api.playbloom.gg/v1/tunnel/open";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostedServer {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    pub memory_mb: u32,
    pub port: u16,
    pub motd: String,
    pub max_players: u16,
    pub created_at: i64,
    pub updated_at: i64,
    pub public_host: Option<String>,
    pub tunnel_state: Option<String>,
    pub tunnel_session_id: Option<String>,
    pub tunnel_expires_at: Option<i64>,
    pub tunnel_last_error: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerCreateRequest {
    pub name: String,
    pub version: String,
    pub loader: Option<String>,
    pub memory_mb: Option<u32>,
    pub port: Option<u16>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerUpdateRequest {
    pub name: Option<String>,
    pub version: Option<String>,
    pub loader: Option<String>,
    pub memory_mb: Option<u32>,
    pub port: Option<u16>,
    pub motd: Option<String>,
    pub max_players: Option<u16>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerStatus {
    pub server_id: String,
    pub running: bool,
    pub pid: Option<u32>,
    pub started_at: Option<i64>,
    pub uptime_seconds: Option<u64>,
    pub local_address: String,
    pub public_address: Option<String>,
    pub tunnel_state: Option<String>,
    pub tunnel_expires_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerLogLine {
    pub id: u64,
    pub ts: i64,
    pub level: String,
    pub source: String,
    pub line: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerFileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerFileReadResult {
    pub relative_path: String,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerBackup {
    pub id: String,
    pub created_at: i64,
    pub size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostedServerTunnelSession {
    pub server_id: String,
    pub state: String,
    pub public_address: String,
    pub relay_endpoint: Option<String>,
    pub session_id: Option<String>,
    pub expires_at: Option<i64>,
    pub message: String,
}

struct ServerRuntime {
    child: Child,
    started_at_unix: i64,
}

static RUNTIMES: OnceLock<Mutex<HashMap<String, ServerRuntime>>> = OnceLock::new();
static SERVER_LOGS: OnceLock<Mutex<HashMap<String, Vec<HostedServerLogLine>>>> = OnceLock::new();
static LOG_ID: OnceLock<Mutex<u64>> = OnceLock::new();

fn runtimes() -> &'static Mutex<HashMap<String, ServerRuntime>> {
    RUNTIMES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn logs_store() -> &'static Mutex<HashMap<String, Vec<HostedServerLogLine>>> {
    SERVER_LOGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_log_id() -> u64 {
    let mut guard = LOG_ID
        .get_or_init(|| Mutex::new(0))
        .lock()
        .expect("log id lock poisoned");
    *guard += 1;
    *guard
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn slugify(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut prev_dash = false;
    for ch in text.trim().chars() {
        let c = ch.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn validate_server_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Server id is required.".into());
    }
    if !id
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
    {
        return Err("Invalid server id.".into());
    }
    Ok(())
}

fn normalize_loader(loader: &str) -> String {
    let lowered = loader.trim().to_ascii_lowercase();
    if lowered == "fabric" || lowered == "paper" {
        lowered
    } else {
        "vanilla".to_string()
    }
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Server name cannot be empty.".into());
    }
    if trimmed.len() > 48 {
        return Err("Server name is too long.".into());
    }
    Ok(trimmed.to_string())
}

fn servers_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("servers");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn server_dir(app: &AppHandle, server_id: &str) -> Result<PathBuf, String> {
    validate_server_id(server_id)?;
    Ok(servers_root(app)?.join(server_id))
}

fn server_meta_path(dir: &Path) -> PathBuf {
    dir.join(SERVER_META_FILE)
}

fn load_server_from_dir(dir: &Path) -> Result<HostedServer, String> {
    let meta_path = server_meta_path(dir);
    let bytes = fs::read(&meta_path).map_err(|e| format!("Failed to read {}: {}", meta_path.display(), e))?;
    serde_json::from_slice::<HostedServer>(&bytes).map_err(|e| format!("Invalid {}: {}", meta_path.display(), e))
}

fn save_server_to_dir(dir: &Path, server: &HostedServer) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(server).map_err(|e| e.to_string())?;
    fs::write(server_meta_path(dir), bytes).map_err(|e| e.to_string())
}

fn collect_servers(app: &AppHandle) -> Result<Vec<HostedServer>, String> {
    let root = servers_root(app)?;
    let mut out = Vec::new();
    let entries = fs::read_dir(&root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(server) = load_server_from_dir(&path) else {
            continue;
        };
        out.push(server);
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

fn write_default_server_files(server_dir: &Path, server: &HostedServer) -> Result<(), String> {
    fs::create_dir_all(server_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(server_dir.join("backups")).map_err(|e| e.to_string())?;
    fs::create_dir_all(server_dir.join("plugins")).map_err(|e| e.to_string())?;
    fs::create_dir_all(server_dir.join("mods")).map_err(|e| e.to_string())?;
    fs::create_dir_all(server_dir.join("world")).map_err(|e| e.to_string())?;

    fs::write(server_dir.join(SERVER_EULA_FILE), "eula=true\n").map_err(|e| e.to_string())?;
    let props = format!(
        "enable-jmx-monitoring=false\nrcon.port=25575\nlevel-seed=\ngamemode=survival\nenable-command-block=false\nenable-query=false\ngenerator-settings=\nenforce-secure-profile=true\nlevel-name=world\nmotd={}\nquery.port=25565\npvp=true\ngenerate-structures=true\nmax-chained-neighbor-updates=1000000\ndifficulty=easy\nnetwork-compression-threshold=256\nmax-tick-time=60000\nuse-native-transport=true\nmax-players={}\nonline-mode=true\nenable-status=true\nallow-flight=false\ninitial-disabled-packs=\nbroadcast-rcon-to-ops=true\nview-distance=10\nserver-ip=\nresource-pack-prompt=\nallow-nether=true\nserver-port={}\nenable-rcon=false\nsync-chunk-writes=true\nop-permission-level=4\nprevent-proxy-connections=false\nhide-online-players=false\nresource-pack=\nentity-broadcast-range-percentage=100\nsimulation-distance=10\nrcon.password=\nplayer-idle-timeout=0\nforce-gamemode=false\nrate-limit=0\nhardcore=false\nwhite-list=false\nbroadcast-console-to-ops=true\nspawn-npcs=true\nspawn-animals=true\nfunction-permission-level=2\ninitial-enabled-packs=vanilla\nlevel-type=minecraft:normal\ntext-filtering-config=\nspawn-monsters=true\nenforce-whitelist=false\nspawn-protection=16\nresource-pack-sha1=\nmax-world-size=29999984\n",
        server.motd.replace('\n', " "),
        server.max_players,
        server.port
    );
    fs::write(server_dir.join(SERVER_PROPERTIES_FILE), props).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
struct MojangManifest {
    versions: Vec<MojangVersionEntry>,
}

#[derive(Deserialize)]
struct MojangVersionEntry {
    id: String,
    url: String,
}

#[derive(Deserialize)]
struct MojangVersionDetail {
    downloads: MojangVersionDownloads,
}

#[derive(Deserialize)]
struct MojangVersionDownloads {
    server: Option<MojangDownloadArtifact>,
}

#[derive(Deserialize)]
struct MojangDownloadArtifact {
    url: String,
}

async fn download_vanilla_server_jar(target_path: &Path, version: &str) -> Result<(), String> {
    let manifest_url = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest = reqwest::get(manifest_url)
        .await
        .map_err(|e| format!("Failed to fetch Mojang version manifest: {}", e))?;
    if !manifest.status().is_success() {
        return Err(format!(
            "Mojang version manifest request failed with HTTP {}",
            manifest.status()
        ));
    }
    let manifest_json: MojangManifest = manifest
        .json()
        .await
        .map_err(|e| format!("Failed to decode Mojang version manifest: {}", e))?;

    let Some(entry) = manifest_json.versions.into_iter().find(|value| value.id == version) else {
        return Err(format!("Minecraft version {} was not found in Mojang manifest.", version));
    };

    let detail = reqwest::get(&entry.url)
        .await
        .map_err(|e| format!("Failed to fetch Mojang metadata for {}: {}", version, e))?;
    if !detail.status().is_success() {
        return Err(format!(
            "Mojang version metadata request failed with HTTP {}",
            detail.status()
        ));
    }
    let detail_json: MojangVersionDetail = detail
        .json()
        .await
        .map_err(|e| format!("Failed to decode Mojang metadata for {}: {}", version, e))?;
    let artifact = detail_json
        .downloads
        .server
        .ok_or_else(|| format!("Minecraft {} does not provide a dedicated server download.", version))?;

    let bytes = reqwest::get(&artifact.url)
        .await
        .map_err(|e| format!("Failed to download server jar: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read server jar bytes: {}", e))?;

    fs::write(target_path, bytes).map_err(|e| format!("Failed to write {}: {}", target_path.display(), e))
}

async fn ensure_server_jar(server_dir: &Path, server: &HostedServer) -> Result<(), String> {
    let jar_path = server_dir.join(SERVER_JAR_FILE);
    if jar_path.exists() {
        return Ok(());
    }
    if server.loader != "vanilla" {
        return Err(format!(
            "Loader '{}' is not yet auto-provisioned. Switch to vanilla or place a server.jar manually.",
            server.loader
        ));
    }
    download_vanilla_server_jar(&jar_path, &server.version).await
}

fn push_log(server_id: &str, level: &str, source: &str, line: &str) {
    let entry = HostedServerLogLine {
        id: next_log_id(),
        ts: now_ts(),
        level: level.to_string(),
        source: source.to_string(),
        line: line.to_string(),
    };
    let mut guard = logs_store()
        .lock()
        .expect("server log lock poisoned");
    let lines = guard.entry(server_id.to_string()).or_default();
    lines.push(entry);
    if lines.len() > SERVER_LOG_LIMIT {
        let remove = lines.len() - SERVER_LOG_LIMIT;
        lines.drain(0..remove);
    }
}

fn spawn_pipe_reader<R: Read + Send + 'static>(server_id: String, source: &'static str, reader: R) {
    thread::spawn(move || {
        let mut buf_reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = match buf_reader.read_line(&mut line) {
                Ok(bytes) => bytes,
                Err(_) => break,
            };
            if bytes == 0 {
                break;
            }
            let msg = line.trim_end_matches(['\r', '\n']).to_string();
            if msg.is_empty() {
                continue;
            }
            let lowered = msg.to_ascii_lowercase();
            let level = if lowered.contains("[error]") || lowered.contains("exception") {
                "error"
            } else if lowered.contains("[warn]") {
                "warn"
            } else {
                "info"
            };
            push_log(&server_id, level, source, &msg);
        }
    });
}

fn remove_runtime_if_exited(server_id: &str) -> Result<(), String> {
    let mut guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    if let Some(runtime) = guard.get_mut(server_id) {
        if runtime.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            guard.remove(server_id);
        }
    }
    Ok(())
}

fn build_status(server: &HostedServer, runtime: Option<&ServerRuntime>) -> HostedServerStatus {
    let public_address = server
        .public_host
        .as_ref()
        .map(|host| format!("{}:25565", host));

    if let Some(active) = runtime {
        let uptime = now_ts().saturating_sub(active.started_at_unix).max(0) as u64;
        HostedServerStatus {
            server_id: server.id.clone(),
            running: true,
            pid: Some(active.child.id()),
            started_at: Some(active.started_at_unix),
            uptime_seconds: Some(uptime),
            local_address: format!("127.0.0.1:{}", server.port),
            public_address,
            tunnel_state: server.tunnel_state.clone(),
            tunnel_expires_at: server.tunnel_expires_at,
            last_error: server.tunnel_last_error.clone(),
        }
    } else {
        HostedServerStatus {
            server_id: server.id.clone(),
            running: false,
            pid: None,
            started_at: None,
            uptime_seconds: None,
            local_address: format!("127.0.0.1:{}", server.port),
            public_address,
            tunnel_state: server.tunnel_state.clone(),
            tunnel_expires_at: server.tunnel_expires_at,
            last_error: server.tunnel_last_error.clone(),
        }
    }
}

fn safe_join_relative(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = relative.trim();
    let target = if rel.is_empty() { "." } else { rel };
    let rel_path = Path::new(target);
    for component in rel_path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err("Invalid path. Parent traversals are not allowed.".into()),
        }
    }
    Ok(base.join(rel_path))
}

fn relative_to_string(base: &Path, full: &Path) -> String {
    full.strip_prefix(base)
        .unwrap_or(full)
        .components()
        .filter_map(|c| match c {
            Component::Normal(v) => Some(v.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn list_dir_entries(base: &Path, dir: &Path) -> Result<Vec<HostedServerFileEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let updated_at = meta
            .modified()
            .ok()
            .and_then(|v| v.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        out.push(HostedServerFileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            relative_path: relative_to_string(base, &path),
            is_dir: meta.is_dir(),
            size_bytes: if meta.is_file() { meta.len() } else { 0 },
            updated_at,
        });
    }
    out.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });
    Ok(out)
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(source).map_err(|e| e.to_string())?.flatten() {
        let src_path = entry.path();
        let name = entry.file_name();
        let dst_path = destination.join(name);
        let meta = fs::metadata(&src_path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn make_server_id(name: &str) -> String {
    let slug = slugify(name);
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_millis())
        .unwrap_or(0);
    if slug.is_empty() {
        format!("server-{}", suffix)
    } else {
        format!("{}-{}", slug, suffix)
    }
}

fn read_server(app: &AppHandle, server_id: &str) -> Result<(PathBuf, HostedServer), String> {
    let dir = server_dir(app, server_id)?;
    if !dir.exists() {
        return Err(format!("Server \"{}\" not found.", server_id));
    }
    let server = load_server_from_dir(&dir)?;
    Ok((dir, server))
}

fn save_updated_server(dir: &Path, mut server: HostedServer) -> Result<HostedServer, String> {
    server.updated_at = now_ts();
    save_server_to_dir(dir, &server)?;
    Ok(server)
}

fn apply_server_properties_patch(server_dir: &Path, server: &HostedServer) -> Result<(), String> {
    let file = server_dir.join(SERVER_PROPERTIES_FILE);
    let text = fs::read_to_string(&file).unwrap_or_default();
    let mut values: HashMap<String, String> = HashMap::new();
    for line in text.lines() {
        if let Some((key, value)) = line.split_once('=') {
            values.insert(key.trim().to_string(), value.to_string());
        }
    }
    values.insert("server-port".to_string(), server.port.to_string());
    values.insert("motd".to_string(), server.motd.clone());
    values.insert("max-players".to_string(), server.max_players.to_string());
    let mut keys = values.keys().cloned().collect::<Vec<_>>();
    keys.sort();
    let mut out = String::new();
    for key in keys {
        out.push_str(&key);
        out.push('=');
        out.push_str(values.get(&key).cloned().unwrap_or_default().as_str());
        out.push('\n');
    }
    fs::write(file, out).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hosted_servers_list(app: AppHandle) -> Result<Vec<HostedServer>, String> {
    collect_servers(&app)
}

#[tauri::command]
pub fn hosted_servers_get(app: AppHandle, server_id: String) -> Result<HostedServer, String> {
    let (_, server) = read_server(&app, &server_id)?;
    Ok(server)
}

#[tauri::command]
pub async fn hosted_servers_create(
    app: AppHandle,
    payload: HostedServerCreateRequest,
) -> Result<HostedServer, String> {
    let name = sanitize_name(&payload.name)?;
    let version = payload.version.trim();
    if version.is_empty() {
        return Err("Minecraft version is required.".into());
    }
    let loader = normalize_loader(payload.loader.as_deref().unwrap_or("vanilla"));
    let memory_mb = payload.memory_mb.unwrap_or(4096).clamp(1024, 12288);
    let port = payload.port.unwrap_or(25565).clamp(1024, 65535);
    let id = make_server_id(&name);
    validate_server_id(&id)?;

    let root = servers_root(&app)?;
    let dir = root.join(&id);
    if dir.exists() {
        return Err("A server with this generated id already exists, try again.".into());
    }

    let now = now_ts();
    let server = HostedServer {
        id: id.clone(),
        name,
        version: version.to_string(),
        loader,
        memory_mb,
        port,
        motd: "A Bloom hosted server".to_string(),
        max_players: 20,
        created_at: now,
        updated_at: now,
        public_host: None,
        tunnel_state: Some("disconnected".to_string()),
        tunnel_session_id: None,
        tunnel_expires_at: None,
        tunnel_last_error: None,
    };

    write_default_server_files(&dir, &server)?;
    save_server_to_dir(&dir, &server)?;
    ensure_server_jar(&dir, &server).await?;
    push_log(
        &server.id,
        "success",
        "system",
        &format!("Created server '{}' ({} {})", server.name, server.loader, server.version),
    );
    Ok(server)
}

#[tauri::command]
pub fn hosted_servers_update(
    app: AppHandle,
    server_id: String,
    payload: HostedServerUpdateRequest,
) -> Result<HostedServer, String> {
    let (dir, mut server) = read_server(&app, &server_id)?;
    if let Some(name) = payload.name {
        server.name = sanitize_name(&name)?;
    }
    if let Some(version) = payload.version {
        let trimmed = version.trim().to_string();
        if trimmed.is_empty() {
            return Err("Version cannot be empty.".into());
        }
        server.version = trimmed;
    }
    if let Some(loader) = payload.loader {
        server.loader = normalize_loader(&loader);
    }
    if let Some(memory_mb) = payload.memory_mb {
        server.memory_mb = memory_mb.clamp(1024, 12288);
    }
    if let Some(port) = payload.port {
        server.port = port.clamp(1024, 65535);
    }
    if let Some(motd) = payload.motd {
        server.motd = motd.replace('\n', " ");
    }
    if let Some(max_players) = payload.max_players {
        server.max_players = max_players.clamp(1, 300);
    }
    apply_server_properties_patch(&dir, &server)?;
    save_updated_server(&dir, server)
}

#[tauri::command]
pub fn hosted_servers_delete(app: AppHandle, server_id: String) -> Result<(), String> {
    let dir = server_dir(&app, &server_id)?;
    if !dir.exists() {
        return Ok(());
    }
    let _ = hosted_servers_stop(app.clone(), server_id.clone());
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    runtimes()
        .lock()
        .map_err(|_| "Runtime lock poisoned.".to_string())?
        .remove(&server_id);
    logs_store()
        .lock()
        .map_err(|_| "Server log lock poisoned.".to_string())?
        .remove(&server_id);
    Ok(())
}

#[tauri::command]
pub async fn hosted_servers_start(app: AppHandle, server_id: String) -> Result<HostedServerStatus, String> {
    remove_runtime_if_exited(&server_id)?;
    let (dir, server) = read_server(&app, &server_id)?;
    ensure_server_jar(&dir, &server).await?;
    fs::write(dir.join(SERVER_EULA_FILE), "eula=true\n").map_err(|e| e.to_string())?;
    apply_server_properties_patch(&dir, &server)?;

    {
        let guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
        if guard.contains_key(&server_id) {
            let status = build_status(&server, guard.get(&server_id));
            return Ok(status);
        }
    }

    let mut command = Command::new("java");
    command
        .arg(format!("-Xms{}M", 512))
        .arg(format!("-Xmx{}M", server.memory_mb))
        .arg("-jar")
        .arg(SERVER_JAR_FILE)
        .arg("nogui")
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to start java process. Is Java installed and available in PATH? {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        spawn_pipe_reader(server_id.clone(), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_pipe_reader(server_id.clone(), "stderr", stderr);
    }

    let started_at = now_ts();
    runtimes()
        .lock()
        .map_err(|_| "Runtime lock poisoned.".to_string())?
        .insert(
            server_id.clone(),
            ServerRuntime {
                child,
                started_at_unix: started_at,
            },
        );

    push_log(
        &server_id,
        "info",
        "system",
        &format!("Launching '{}' on 127.0.0.1:{}...", server.name, server.port),
    );
    let guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    Ok(build_status(&server, guard.get(&server_id)))
}

#[tauri::command]
pub fn hosted_servers_stop(app: AppHandle, server_id: String) -> Result<HostedServerStatus, String> {
    remove_runtime_if_exited(&server_id)?;
    let (_, server) = read_server(&app, &server_id)?;
    let mut guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    let Some(runtime) = guard.get_mut(&server_id) else {
        return Ok(build_status(&server, None));
    };

    if let Some(stdin) = runtime.child.stdin.as_mut() {
        let _ = stdin.write_all(b"stop\n");
        let _ = stdin.flush();
    }
    let mut waited = 0u64;
    loop {
        match runtime.child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if waited >= 12 {
                    break;
                }
                thread::sleep(Duration::from_millis(500));
                waited += 1;
            }
            Err(e) => {
                push_log(&server_id, "error", "system", &format!("Failed while stopping process: {}", e));
                break;
            }
        }
    }
    if runtime.child.try_wait().ok().flatten().is_none() {
        let _ = runtime.child.kill();
        let _ = runtime.child.wait();
    }
    guard.remove(&server_id);
    push_log(&server_id, "warn", "system", "Server process stopped.");
    Ok(build_status(&server, None))
}

#[tauri::command]
pub async fn hosted_servers_restart(app: AppHandle, server_id: String) -> Result<HostedServerStatus, String> {
    let _ = hosted_servers_stop(app.clone(), server_id.clone())?;
    hosted_servers_start(app, server_id).await
}

#[tauri::command]
pub fn hosted_servers_status(app: AppHandle, server_id: String) -> Result<HostedServerStatus, String> {
    remove_runtime_if_exited(&server_id)?;
    let (_, server) = read_server(&app, &server_id)?;
    let guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    Ok(build_status(&server, guard.get(&server_id)))
}

#[tauri::command]
pub fn hosted_servers_send_command(
    app: AppHandle,
    server_id: String,
    command: String,
) -> Result<(), String> {
    let _ = read_server(&app, &server_id)?;
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    let mut guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    let Some(runtime) = guard.get_mut(&server_id) else {
        return Err("Server is not running.".into());
    };
    let Some(stdin) = runtime.child.stdin.as_mut() else {
        return Err("Server stdin is unavailable.".into());
    };

    stdin
        .write_all(format!("{}\n", trimmed).as_bytes())
        .map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    push_log(&server_id, "command", "stdin", &format!("> {}", trimmed));
    Ok(())
}

#[tauri::command]
pub fn hosted_servers_logs(
    app: AppHandle,
    server_id: String,
    limit: Option<usize>,
) -> Result<Vec<HostedServerLogLine>, String> {
    let _ = read_server(&app, &server_id)?;
    let max = limit.unwrap_or(200).clamp(1, 1000);
    let guard = logs_store()
        .lock()
        .map_err(|_| "Server log lock poisoned.".to_string())?;
    let lines = guard.get(&server_id).cloned().unwrap_or_default();
    if lines.len() <= max {
        return Ok(lines);
    }
    Ok(lines[lines.len() - max..].to_vec())
}

#[tauri::command]
pub fn hosted_servers_logs_clear(app: AppHandle, server_id: String) -> Result<(), String> {
    let _ = read_server(&app, &server_id)?;
    logs_store()
        .lock()
        .map_err(|_| "Server log lock poisoned.".to_string())?
        .insert(server_id, Vec::new());
    Ok(())
}

#[tauri::command]
pub async fn hosted_servers_open_folder(app: AppHandle, server_id: String) -> Result<(), String> {
    let dir = server_dir(&app, &server_id)?;
    if !dir.exists() {
        return Err("Server directory does not exist.".into());
    }
    let path_str = dir
        .to_str()
        .ok_or_else(|| "Server directory path contains unsupported characters.".to_string())?;
    tauri_plugin_opener::open_path(path_str, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hosted_servers_files_list(
    app: AppHandle,
    server_id: String,
    relative_path: Option<String>,
) -> Result<Vec<HostedServerFileEntry>, String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let target = safe_join_relative(&dir, relative_path.as_deref().unwrap_or("."))?;
    if !target.exists() {
        return Err("Path does not exist.".into());
    }
    if !target.is_dir() {
        return Err("Path is not a directory.".into());
    }
    list_dir_entries(&dir, &target)
}

#[tauri::command]
pub fn hosted_servers_files_read(
    app: AppHandle,
    server_id: String,
    relative_path: String,
) -> Result<HostedServerFileReadResult, String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let file = safe_join_relative(&dir, &relative_path)?;
    if !file.exists() || !file.is_file() {
        return Err("File not found.".into());
    }
    let text = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    if text.len() > 2_000_000 {
        return Err("File is too large to open in the embedded editor.".into());
    }
    Ok(HostedServerFileReadResult {
        relative_path: relative_to_string(&dir, &file),
        text,
    })
}

#[tauri::command]
pub fn hosted_servers_files_write(
    app: AppHandle,
    server_id: String,
    relative_path: String,
    text: String,
) -> Result<(), String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let file = safe_join_relative(&dir, &relative_path)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(file, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hosted_servers_files_create(
    app: AppHandle,
    server_id: String,
    relative_path: String,
    directory: bool,
) -> Result<(), String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let path = safe_join_relative(&dir, &relative_path)?;
    if directory {
        fs::create_dir_all(path).map_err(|e| e.to_string())
    } else {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !path.exists() {
            fs::write(path, "").map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
pub fn hosted_servers_files_rename(
    app: AppHandle,
    server_id: String,
    from_relative_path: String,
    to_relative_path: String,
) -> Result<(), String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let from = safe_join_relative(&dir, &from_relative_path)?;
    let to = safe_join_relative(&dir, &to_relative_path)?;
    if !from.exists() {
        return Err("Source path does not exist.".into());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hosted_servers_files_delete(
    app: AppHandle,
    server_id: String,
    relative_path: String,
) -> Result<(), String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let path = safe_join_relative(&dir, &relative_path)?;
    if !path.exists() {
        return Ok(());
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn hosted_servers_backups_list(app: AppHandle, server_id: String) -> Result<Vec<HostedServerBackup>, String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let backups_root = dir.join("backups");
    fs::create_dir_all(&backups_root).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&backups_root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().to_string();
        let created_at = fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let size_bytes = dir_size(&path)?;
        out.push(HostedServerBackup {
            id,
            created_at,
            size_bytes,
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

fn dir_size(path: &Path) -> Result<u64, String> {
    let mut total = 0_u64;
    for entry in fs::read_dir(path).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            total += dir_size(&p)?;
        } else {
            total += meta.len();
        }
    }
    Ok(total)
}

#[tauri::command]
pub fn hosted_servers_backups_create(app: AppHandle, server_id: String) -> Result<HostedServerBackup, String> {
    remove_runtime_if_exited(&server_id)?;
    let (dir, _) = read_server(&app, &server_id)?;
    let guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    if guard.contains_key(&server_id) {
        return Err("Stop the server before creating a backup.".into());
    }
    drop(guard);

    let backups_root = dir.join("backups");
    fs::create_dir_all(&backups_root).map_err(|e| e.to_string())?;
    let id = format!("backup-{}", now_ts());
    let backup_dir = backups_root.join(&id);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "backups" || name == SERVER_META_FILE {
            continue;
        }
        let target = backup_dir.join(&name);
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }

    let size_bytes = dir_size(&backup_dir)?;
    push_log(&server_id, "success", "backup", &format!("Created backup {}", id));
    Ok(HostedServerBackup {
        id,
        created_at: now_ts(),
        size_bytes,
    })
}

#[tauri::command]
pub fn hosted_servers_backups_delete(
    app: AppHandle,
    server_id: String,
    backup_id: String,
) -> Result<(), String> {
    let (dir, _) = read_server(&app, &server_id)?;
    let backups_root = dir.join("backups");
    let target = safe_join_relative(&backups_root, &backup_id)?;
    if target.exists() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hosted_servers_backups_restore(
    app: AppHandle,
    server_id: String,
    backup_id: String,
) -> Result<(), String> {
    remove_runtime_if_exited(&server_id)?;
    let (dir, _) = read_server(&app, &server_id)?;
    let guard = runtimes().lock().map_err(|_| "Runtime lock poisoned.".to_string())?;
    if guard.contains_key(&server_id) {
        return Err("Stop the server before restoring a backup.".into());
    }
    drop(guard);

    let backups_root = dir.join("backups");
    let source = safe_join_relative(&backups_root, &backup_id)?;
    if !source.exists() || !source.is_dir() {
        return Err("Backup not found.".into());
    }

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "backups" || name == SERVER_META_FILE {
            continue;
        }
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
        } else {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    for entry in fs::read_dir(&source).map_err(|e| e.to_string())?.flatten() {
        let src = entry.path();
        let dst = dir.join(entry.file_name());
        let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
        if meta.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }

    push_log(&server_id, "warn", "backup", &format!("Restored backup {}", backup_id));
    Ok(())
}

#[tauri::command]
pub async fn hosted_servers_tunnel_open(
    app: AppHandle,
    server_id: String,
    requested_subdomain: Option<String>,
) -> Result<HostedServerTunnelSession, String> {
    let (dir, mut server) = read_server(&app, &server_id)?;
    let default_subdomain = slugify(&server.name);
    let mut subdomain = requested_subdomain
        .as_deref()
        .map(slugify)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_subdomain);
    if subdomain.is_empty() {
        subdomain = "bloom-server".to_string();
    }
    if subdomain.len() > 32 {
        subdomain.truncate(32);
    }
    let public_host = format!("{}.playbloom.gg", subdomain);
    let relay_endpoint = std::env::var("BLOOM_RELAY_ENDPOINT").ok();
    let relay_api = std::env::var("BLOOM_RELAY_API_URL").unwrap_or_else(|_| DEFAULT_RELAY_API_URL.to_string());
    let relay_api_key = std::env::var("BLOOM_RELAY_API_KEY").ok();
    let body = serde_json::json!({
        "serverId": server.id,
        "subdomain": subdomain,
        "localPort": server.port
    });
    let client = reqwest::Client::new();
    let mut req = client.post(&relay_api).json(&body);
    if let Some(key) = relay_api_key {
        req = req.bearer_auth(key);
    }
    let (state, session_id, expires_at, message, last_error) = match req.send().await {
        Ok(response) => {
            if response.status().is_success() {
                let parsed: serde_json::Value = response
                    .json()
                    .await
                    .unwrap_or_else(|_| serde_json::json!({}));
                let state = parsed
                    .get("state")
                    .and_then(|v| v.as_str())
                    .unwrap_or("connected")
                    .to_string();
                let session_id = parsed.get("sessionId").and_then(|v| v.as_str()).map(|v| v.to_string());
                let expires_at = parsed.get("expiresAt").and_then(|v| v.as_i64());
                let message = parsed
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Tunnel connected.")
                    .to_string();
                (state, session_id, expires_at, message, None)
            } else {
                (
                    "error".to_string(),
                    None,
                    None,
                    "Relay API request failed.".to_string(),
                    Some(format!("Relay API returned HTTP {}", response.status())),
                )
            }
        }
        Err(error) => {
            let err_text = error.to_string();
            let lowered = err_text.to_ascii_lowercase();
            let friendly = if lowered.contains("dns")
                || lowered.contains("failed to lookup address information")
                || lowered.contains("name or service not known")
                || lowered.contains("could not resolve host")
            {
                "Relay API domain is not reachable (DNS lookup failed for api.playbloom.gg). Deploy API + DNS first.".to_string()
            } else {
                "Failed to reach relay API endpoint.".to_string()
            };
            (
                "error".to_string(),
                None,
                None,
                friendly,
                Some(err_text),
            )
        }
    };

    server.public_host = if state == "connected" {
        Some(public_host.clone())
    } else {
        None
    };
    server.tunnel_state = Some(state.clone());
    server.tunnel_session_id = session_id.clone();
    server.tunnel_expires_at = expires_at;
    server.tunnel_last_error = last_error.clone();
    let updated = save_updated_server(&dir, server)?;
    push_log(
        &updated.id,
        if state == "connected" { "success" } else { "warn" },
        "tunnel",
        &format!("Tunnel state: {} ({})", state, message),
    );

    Ok(HostedServerTunnelSession {
        server_id,
        state,
        public_address: format!("{}:25565", public_host),
        relay_endpoint,
        session_id,
        expires_at,
        message,
    })
}

#[tauri::command]
pub fn hosted_servers_tunnel_close(app: AppHandle, server_id: String) -> Result<HostedServerTunnelSession, String> {
    let (dir, mut server) = read_server(&app, &server_id)?;
    server.tunnel_state = Some("disconnected".to_string());
    server.public_host = None;
    server.tunnel_session_id = None;
    server.tunnel_expires_at = None;
    server.tunnel_last_error = None;
    let host = server
        .public_host
        .clone()
        .unwrap_or_else(|| format!("{}.playbloom.gg", slugify(&server.name)));
    let updated = save_updated_server(&dir, server)?;
    push_log(&updated.id, "warn", "tunnel", "Tunnel disconnected.");
    Ok(HostedServerTunnelSession {
        server_id,
        state: "disconnected".to_string(),
        public_address: format!("{}:25565", host),
        relay_endpoint: std::env::var("BLOOM_RELAY_ENDPOINT").ok(),
        session_id: None,
        expires_at: None,
        message: "Tunnel disconnected.".to_string(),
    })
}
