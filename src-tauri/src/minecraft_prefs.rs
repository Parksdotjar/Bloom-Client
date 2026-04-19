use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const PREFS_FILE: &str = "minecraft_preferences.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftPreferences {
    #[serde(default = "default_show_bloom_nametag_logo")]
    pub show_bloom_nametag_logo: bool,
    #[serde(default = "default_show_bloom_tab_logo")]
    pub show_bloom_tab_logo: bool,
    #[serde(default = "default_show_bloom_chat_logo")]
    pub show_bloom_chat_logo: bool,
    #[serde(default = "default_bloom_logo_side")]
    pub bloom_logo_side: String,
}

impl Default for MinecraftPreferences {
    fn default() -> Self {
        Self {
            show_bloom_nametag_logo: default_show_bloom_nametag_logo(),
            show_bloom_tab_logo: default_show_bloom_tab_logo(),
            show_bloom_chat_logo: default_show_bloom_chat_logo(),
            bloom_logo_side: default_bloom_logo_side(),
        }
    }
}

fn default_show_bloom_nametag_logo() -> bool {
    true
}

fn default_show_bloom_tab_logo() -> bool {
    true
}

fn default_show_bloom_chat_logo() -> bool {
    true
}

fn default_bloom_logo_side() -> String {
    "right".to_string()
}

fn prefs_path_from_app(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    Ok(app_data.join(PREFS_FILE))
}

fn fallback_app_data_dir() -> PathBuf {
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return PathBuf::from(appdata).join("com.bloomunit.client");
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn read_preferences_from_disk() -> MinecraftPreferences {
    let path = fallback_app_data_dir().join(PREFS_FILE);
    read_preferences_at_path(&path)
}

fn read_preferences_at_path(path: &Path) -> MinecraftPreferences {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<MinecraftPreferences>(&raw).unwrap_or_default(),
        Err(_) => MinecraftPreferences::default(),
    }
}

fn write_preferences_at_path(path: &Path, prefs: &MinecraftPreferences) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn minecraft_preferences_get(app: AppHandle) -> Result<MinecraftPreferences, String> {
    let path = prefs_path_from_app(&app)?;
    Ok(read_preferences_at_path(&path))
}

#[tauri::command]
pub fn minecraft_preferences_set(
    app: AppHandle,
    payload: MinecraftPreferences,
) -> Result<MinecraftPreferences, String> {
    let path = prefs_path_from_app(&app)?;
    write_preferences_at_path(&path, &payload)?;

    Ok(payload)
}
