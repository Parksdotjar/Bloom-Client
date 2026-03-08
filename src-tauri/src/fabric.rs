use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FabricLoaderVersions {
    pub loader: FabricLoader,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FabricLoader {
    pub version: String,
    pub stable: bool,
}

#[tauri::command]
pub async fn fabric_versions_list(mc_version: String) -> Result<Vec<FabricLoaderVersions>, String> {
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}",
        mc_version
    );

    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Fabric versions: HTTP {}",
            response.status()
        ));
    }

    let versions: Vec<FabricLoaderVersions> = response.json().await.map_err(|e| e.to_string())?;

    Ok(versions)
}
