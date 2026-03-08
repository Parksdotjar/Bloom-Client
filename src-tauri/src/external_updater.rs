use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use tauri::AppHandle;

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/Parksdotjar/Bloom-Client/releases/latest";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalUpdateInfo {
    pub version: String,
    pub installer_url: String,
    pub asset_name: String,
}

fn normalize_version(input: &str) -> String {
    input.trim().trim_start_matches('v').to_string()
}

fn compare_versions(current: &str, latest: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let cur = normalize_version(current);
    let lat = normalize_version(latest);
    let cur_parts: Vec<u64> = cur
        .split('.')
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .collect();
    let lat_parts: Vec<u64> = lat
        .split('.')
        .map(|p| p.parse::<u64>().unwrap_or(0))
        .collect();

    let max_len = cur_parts.len().max(lat_parts.len());
    for idx in 0..max_len {
        let a = *cur_parts.get(idx).unwrap_or(&0);
        let b = *lat_parts.get(idx).unwrap_or(&0);
        match a.cmp(&b) {
            Ordering::Equal => continue,
            ordering => return ordering,
        }
    }

    Ordering::Equal
}

fn find_windows_installer(assets: &[GitHubAsset]) -> Option<&GitHubAsset> {
    assets.iter().find(|asset| {
        let name = asset.name.to_ascii_lowercase();
        name.ends_with("-setup.exe") || name.ends_with(".msi")
    })
}

#[tauri::command]
pub async fn external_update_check(app: AppHandle) -> Result<Option<ExternalUpdateInfo>, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::new();
    let response = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Release API returned HTTP {}", response.status()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release response: {e}"))?;

    let latest_version = normalize_version(&release.tag_name);
    let current_version = normalize_version(&current_version);

    if compare_versions(&current_version, &latest_version) != std::cmp::Ordering::Less {
        return Ok(None);
    }

    let installer = find_windows_installer(&release.assets)
        .ok_or_else(|| "No Windows installer asset found in latest release".to_string())?;

    Ok(Some(ExternalUpdateInfo {
        version: latest_version,
        installer_url: installer.browser_download_url.clone(),
        asset_name: installer.name.clone(),
    }))
}

#[tauri::command]
pub async fn external_update_install(
    app: AppHandle,
    installer_url: String,
    version: String,
) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = installer_url;
        let _ = version;
        return Err(
            "External installer updates are currently implemented for Windows only".to_string(),
        );
    }

    #[cfg(target_os = "windows")]
    {
        let response = reqwest::Client::new()
            .get(&installer_url)
            .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download installer: {e}"))?;

        if !response.status().is_success() {
            return Err(format!(
                "Installer download returned HTTP {}",
                response.status()
            ));
        }

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read installer bytes: {e}"))?;

        let temp_dir = std::env::temp_dir().join("bloom-client-updater");
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create updater temp directory: {e}"))?;

        let safe_version = normalize_version(&version).replace(['\\', '/', ':', ' '], "_");
        let installer_path = temp_dir.join(format!("BloomClient-{safe_version}-setup.exe"));
        fs::write(&installer_path, bytes)
            .map_err(|e| format!("Failed to write installer file: {e}"))?;

        let current_exe = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve current executable path: {e}"))?;

        let relaunch_script_path = temp_dir.join("run-bloom-update.cmd");
        let script = format!(
            "@echo off\r\n\"{}\" /S\r\nstart \"\" \"{}\"\r\n",
            installer_path.display(),
            current_exe.display()
        );

        fs::write(&relaunch_script_path, script)
            .map_err(|e| format!("Failed to write updater script: {e}"))?;

        Command::new("cmd")
            .arg("/C")
            .arg(relaunch_script_path.as_os_str())
            .spawn()
            .map_err(|e| format!("Failed to start updater script: {e}"))?;

        app.exit(0);
        Ok(())
    }
}
