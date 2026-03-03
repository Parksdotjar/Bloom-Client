use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String, // "release", "snapshot", "old_beta", "old_alpha"
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
}

#[tauri::command]
pub async fn mc_versions_list() -> Result<VersionManifest, String> {
    let url = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
    
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to fetch version manifest: HTTP {}", response.status()));
    }
    
    let manifest: VersionManifest = response.json().await.map_err(|e| e.to_string())?;
    
    Ok(manifest)
}
