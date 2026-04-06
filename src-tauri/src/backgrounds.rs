use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::PathBuf;
use serde::Serialize;
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

fn video_background_prefix() -> &'static str {
    "custom-background-video"
}

fn find_video_background_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let dir = background_dir(app)?;
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read background directory: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with(video_background_prefix()) {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn clear_video_background_files(app: &AppHandle) -> Result<(), String> {
    if let Some(path) = find_video_background_path(app)? {
        fs::remove_file(path).map_err(|e| format!("Failed to remove custom video background: {e}"))?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBackgroundVideo {
    pub path: String,
    pub file_name: String,
    pub mime_type: String,
    pub data_url: Option<String>,
}

#[tauri::command]
pub fn launcher_background_save(app: AppHandle, data: Vec<u8>) -> Result<(), String> {
    clear_video_background_files(&app)?;
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
    clear_video_background_files(&app)?;
    Ok(())
}

#[tauri::command]
pub fn launcher_background_video_save(
    app: AppHandle,
    file_name: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<StoredBackgroundVideo, String> {
    let dir = background_dir(&app)?;
    let extension = PathBuf::from(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if mime_type.eq_ignore_ascii_case("video/webm") {
                "webm".to_string()
            } else if mime_type.eq_ignore_ascii_case("video/ogg") {
                "ogv".to_string()
            } else {
                "mp4".to_string()
            }
        });
    let target = dir.join(format!("{}.{}", video_background_prefix(), extension));
    let image_path = background_path(&app)?;
    if image_path.exists() {
        let _ = fs::remove_file(image_path);
    }
    clear_video_background_files(&app)?;
    fs::write(&target, data).map_err(|e| format!("Failed to save custom video background: {e}"))?;
    Ok(StoredBackgroundVideo {
        path: target.to_string_lossy().to_string(),
        file_name,
        mime_type,
        data_url: None,
    })
}

#[tauri::command]
pub fn launcher_background_video_load(app: AppHandle) -> Result<Option<StoredBackgroundVideo>, String> {
    let Some(path) = find_video_background_path(&app)? else {
        return Ok(None);
    };
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("custom-background-video.mp4")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "mp4".to_string());
    let mime_type = match extension.as_str() {
        "webm" => "video/webm",
        "ogv" | "ogg" => "video/ogg",
        _ => "video/mp4",
    }
    .to_string();
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read custom video background: {e}"))?;
    Ok(Some(StoredBackgroundVideo {
        path: path.to_string_lossy().to_string(),
        file_name,
        mime_type: mime_type.clone(),
        data_url: Some(format!(
            "data:{};base64,{}",
            mime_type,
            general_purpose::STANDARD.encode(bytes)
        )),
    }))
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
