use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn background_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = app_data.join("backgrounds");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn background_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(background_dir(app)?.join("custom-background.jpg"))
}

#[tauri::command]
pub fn launcher_background_save(app: AppHandle, data: Vec<u8>) -> Result<(), String> {
    let path = background_path(&app)?;
    fs::write(path, data).map_err(|e| format!("Failed to save custom background: {e}"))
}

#[tauri::command]
pub fn launcher_background_load(app: AppHandle) -> Result<Option<String>, String> {
    let path = background_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|e| format!("Failed to read custom background: {e}"))?;
    Ok(Some(format!(
        "data:image/jpeg;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )))
}

#[tauri::command]
pub fn launcher_background_clear(app: AppHandle) -> Result<(), String> {
    let path = background_path(&app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to remove custom background: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let target = PathBuf::from(path);
    if target.as_os_str().is_empty() {
        return Err("invalid_save_path".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create save directory: {e}"))?;
    }
    fs::write(&target, data).map_err(|e| format!("Failed to save file: {e}"))
}
