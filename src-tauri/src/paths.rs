use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub app_data: PathBuf,
    pub instances: PathBuf,
    pub cache: PathBuf,
    pub logs: PathBuf,
    pub runtimes: PathBuf,
}

#[tauri::command]
pub fn paths_get(app: AppHandle) -> Result<AppPaths, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let instances = app_data.join("instances");
    let cache = app_data.join("cache");
    let logs = app_data.join("logs");
    let runtimes = app_data.join("runtimes");

    // Ensure all required directories exist
    let _ = std::fs::create_dir_all(&instances);
    let _ = std::fs::create_dir_all(&cache);
    let _ = std::fs::create_dir_all(&logs);
    let _ = std::fs::create_dir_all(&runtimes);

    Ok(AppPaths {
        app_data,
        instances,
        cache,
        logs,
        runtimes,
    })
}
