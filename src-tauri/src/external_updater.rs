use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::process::Command;
use tauri::AppHandle;

const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/Parksdotjar/Bloom-Client/releases/latest";
const EMBEDDED_LATEST_JSON: &str = include_str!("../../latest.json");

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseManifest {
    version: String,
    installer_url: Option<String>,
    asset_name: Option<String>,
    fallback_installer_urls: Option<Vec<String>>,
    windows: Option<SupabaseWindowsManifest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupabaseWindowsManifest {
    installer_url: Option<String>,
    asset_name: Option<String>,
    nsis_url: Option<String>,
    nsis_asset_name: Option<String>,
    fallback_installer_urls: Option<Vec<String>>,
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

async fn download_installer_bytes(installer_url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(installer_url)
        .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to download installer from {installer_url}: {e}"))?;

    if response.status().is_success() {
        return response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("Failed to read installer bytes from {installer_url}: {e}"));
    }

    if response.status() == reqwest::StatusCode::BAD_REQUEST && installer_url.contains('?') {
        let fallback_url = installer_url
            .split('?')
            .next()
            .unwrap_or(installer_url)
            .trim()
            .to_string();

        let fallback_response = client
            .get(&fallback_url)
            .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download installer from fallback URL {fallback_url}: {e}"))?;

        if fallback_response.status().is_success() {
            return fallback_response
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| format!("Failed to read installer bytes from fallback URL {fallback_url}: {e}"));
        }

        return Err(format!(
            "Installer download returned HTTP {} (fallback HTTP {})",
            response.status(),
            fallback_response.status()
        ));
    }

    Err(format!("Installer download returned HTTP {}", response.status()))
}

fn sanitize_url(input: &str) -> String {
    input.trim().replace(' ', "%20")
}

fn configured_supabase_origin() -> Option<String> {
    let raw = std::env::var("BLOOM_SUPABASE_URL")
        .ok()
        .or_else(|| option_env!("BLOOM_SUPABASE_URL").map(str::to_string))?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    match reqwest::Url::parse(trimmed) {
        Ok(parsed) => {
            let host = parsed.host_str()?;
            let port = parsed
                .port()
                .map(|value| format!(":{value}"))
                .unwrap_or_default();
            Some(format!("{}://{}{}", parsed.scheme(), host, port))
        }
        Err(_) => Some(trimmed.trim_end_matches('/').to_string()),
    }
}

fn build_supabase_public_url(file_name: &str) -> Option<String> {
    let origin = configured_supabase_origin()?;
    Some(format!(
        "{}/storage/v1/object/public/updates/{}",
        origin.trim_end_matches('/'),
        file_name
    ))
}

fn push_candidate(candidates: &mut Vec<String>, seen: &mut HashSet<String>, candidate: Option<String>) {
    if let Some(raw) = candidate {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return;
        }
        let sanitized = sanitize_url(trimmed);
        if seen.insert(sanitized.clone()) {
            candidates.push(sanitized);
        }
    }
}

fn build_manifest_candidate_urls(manifest: &SupabaseManifest) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    push_candidate(
        &mut candidates,
        &mut seen,
        manifest
            .windows
            .as_ref()
            .and_then(|w| w.installer_url.clone()),
    );
    push_candidate(
        &mut candidates,
        &mut seen,
        manifest.windows.as_ref().and_then(|w| w.nsis_url.clone()),
    );
    push_candidate(
        &mut candidates,
        &mut seen,
        manifest.installer_url.clone(),
    );

    if let Some(windows) = &manifest.windows {
        if let Some(extra) = &windows.fallback_installer_urls {
            for url in extra {
                push_candidate(&mut candidates, &mut seen, Some(url.clone()));
            }
        }
        if let Some(asset_name) = &windows.asset_name {
            push_candidate(
                &mut candidates,
                &mut seen,
                build_supabase_public_url(asset_name),
            );
        }
        if let Some(nsis_asset_name) = &windows.nsis_asset_name {
            push_candidate(
                &mut candidates,
                &mut seen,
                build_supabase_public_url(nsis_asset_name),
            );
        }
    }

    if let Some(extra) = &manifest.fallback_installer_urls {
        for url in extra {
            push_candidate(&mut candidates, &mut seen, Some(url.clone()));
        }
    }

    if let Some(asset_name) = &manifest.asset_name {
        push_candidate(
            &mut candidates,
            &mut seen,
            build_supabase_public_url(asset_name),
        );
    }

    let version = normalize_version(&manifest.version);
    push_candidate(
        &mut candidates,
        &mut seen,
        build_supabase_public_url(&format!(
            "BloomClient-v{}-x64-setup.exe",
            version
        )),
    );
    push_candidate(
        &mut candidates,
        &mut seen,
        build_supabase_public_url("BloomClient-latest-x64-setup.exe"),
    );

    candidates
}

async fn fetch_manifest_from_url(
    client: &reqwest::Client,
    url: &str,
    source_label: &str,
) -> Result<SupabaseManifest, String> {
    let response = client
        .get(url)
        .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
        .send()
        .await
        .map_err(|e| format!("{source_label} request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("{source_label} returned HTTP {}", response.status()));
    }

    response
        .json()
        .await
        .map_err(|e| format!("{source_label} parse failed: {e}"))
}

async fn fetch_supabase_manifest_with_fallback() -> Result<SupabaseManifest, String> {
    let Some(origin) = configured_supabase_origin() else {
        return Err("Supabase updater URL is not configured.".to_string());
    };
    let origin = origin.trim_end_matches('/').to_string();
    let primary = format!("{origin}/storage/v1/object/public/updates/latest.json");
    let fallback = format!("{origin}/updates/latest.json");
    let client = reqwest::Client::new();
    let sources = [
        ("Supabase latest.json primary", primary.as_str()),
        ("Supabase latest.json fallback", fallback.as_str()),
    ];

    let mut errors = Vec::new();
    for (label, url) in sources {
        match fetch_manifest_from_url(&client, url, label).await {
            Ok(manifest) => return Ok(manifest),
            Err(err) => errors.push(err),
        }
    }

    Err(format!(
        "All manifest sources failed: {}",
        errors.join(" | ")
    ))
}

async fn external_update_check_supabase(
    current_version: &str,
) -> Result<Option<ExternalUpdateInfo>, String> {
    let manifest = fetch_supabase_manifest_with_fallback().await?;

    let latest_version = normalize_version(&manifest.version);
    if compare_versions(current_version, &latest_version) != std::cmp::Ordering::Less {
        return Ok(None);
    }

    let installer_url = build_manifest_candidate_urls(&manifest)
        .into_iter()
        .next()
        .ok_or_else(|| "Supabase manifest missing installer URL".to_string())?;

    let asset_name = manifest
        .windows
        .as_ref()
        .and_then(|w| w.asset_name.clone())
        .or_else(|| manifest.windows.as_ref().and_then(|w| w.nsis_asset_name.clone()))
        .or(manifest.asset_name.clone())
        .unwrap_or_else(|| "BloomClient-latest-x64-setup.exe".to_string());

    Ok(Some(ExternalUpdateInfo {
        version: latest_version,
        installer_url,
        asset_name,
    }))
}

fn external_update_check_embedded_manifest(
    current_version: &str,
) -> Result<Option<ExternalUpdateInfo>, String> {
    let manifest: SupabaseManifest = serde_json::from_str(EMBEDDED_LATEST_JSON)
        .map_err(|e| format!("Failed to parse bundled latest.json: {e}"))?;

    let latest_version = normalize_version(&manifest.version);
    if compare_versions(current_version, &latest_version) != std::cmp::Ordering::Less {
        return Ok(None);
    }

    let installer_url = build_manifest_candidate_urls(&manifest)
        .into_iter()
        .next()
        .ok_or_else(|| "Bundled latest.json is missing installer URL".to_string())?;

    let asset_name = manifest
        .windows
        .as_ref()
        .and_then(|w| w.asset_name.clone())
        .or_else(|| manifest.windows.as_ref().and_then(|w| w.nsis_asset_name.clone()))
        .or(manifest.asset_name.clone())
        .unwrap_or_else(|| "BloomClient-latest-x64-setup.exe".to_string());

    Ok(Some(ExternalUpdateInfo {
        version: latest_version,
        installer_url,
        asset_name,
    }))
}

async fn fetch_supabase_manifest() -> Result<SupabaseManifest, String> {
    fetch_supabase_manifest_with_fallback().await
}

#[tauri::command]
pub async fn external_update_check(app: AppHandle) -> Result<Option<ExternalUpdateInfo>, String> {
    let current_version = normalize_version(&app.package_info().version.to_string());

    if let Ok(update) = external_update_check_supabase(&current_version).await {
        return Ok(update);
    }

    if let Ok(update) = external_update_check_embedded_manifest(&current_version) {
        return Ok(update);
    }

    let client = reqwest::Client::new();
    let response = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header(reqwest::header::USER_AGENT, "BloomClientUpdater/1.0")
        .send()
        .await;

    let response = match response {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };

    if !response.status().is_success() {
        return Ok(None);
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release response: {e}"))?;

    let latest_version = normalize_version(&release.tag_name);

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
        let mut candidate_urls = Vec::new();
        let mut seen = HashSet::new();
        push_candidate(
            &mut candidate_urls,
            &mut seen,
            Some(installer_url.clone()),
        );

        if let Ok(manifest) = fetch_supabase_manifest().await {
            for candidate in build_manifest_candidate_urls(&manifest) {
                push_candidate(&mut candidate_urls, &mut seen, Some(candidate));
            }
        }

        let mut last_error: Option<String> = None;
        let mut downloaded_bytes: Option<Vec<u8>> = None;
        for candidate in &candidate_urls {
            match download_installer_bytes(candidate).await {
                Ok(bytes) => {
                    downloaded_bytes = Some(bytes);
                    break;
                }
                Err(err) => {
                    last_error = Some(format!("{candidate} -> {err}"));
                }
            }
        }

        let bytes = downloaded_bytes.ok_or_else(|| {
            format!(
                "Installer download failed for all candidate URLs. last_error={}",
                last_error.unwrap_or_else(|| "unknown".to_string())
            )
        })?;

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
