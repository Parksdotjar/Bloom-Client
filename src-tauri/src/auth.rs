use serde::{Deserialize, Serialize};
use reqwest::Client;
use reqwest::multipart;
use std::time::Duration;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

const CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb"; // Prism Launcher Client ID (Supports Device Code)
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: i32,
    pub interval: i32,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
    pub skin_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub ms_access_token: String,
    pub ms_refresh_token: String,
    pub mc_access_token: String,
    pub profile: MinecraftProfile,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkinUploadResult {
    pub skin_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PulledSkinResponse {
    pub resolved_name: String,
    pub uuid: String,
    pub model: String,
    pub image_bytes: Vec<u8>,
}

fn auth_http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn build_verification_uri_complete(base_uri: &str, user_code: &str) -> String {
    if base_uri.contains('?') {
        format!("{base_uri}&otc={user_code}")
    } else {
        format!("{base_uri}?otc={user_code}")
    }
}

#[tauri::command]
pub fn auth_open_browser(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http(s) URLs are allowed.".into());
    }

    webbrowser::open(&url)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_login_start() -> Result<DeviceCodeResponse, String> {
    let client = auth_http_client()?;
    let res = client.post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", SCOPE),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    if let Some(err) = data.get("error") {
        return Err(err.as_str().unwrap_or("Unknown MS error").to_string());
    }

    let user_code = data["user_code"].as_str().unwrap_or("").to_string();
    let verification_uri = data["verification_uri"].as_str().unwrap_or("").to_string();
    let verification_uri_complete = data
        .get("verification_uri_complete")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .or_else(|| Some(build_verification_uri_complete(&verification_uri, &user_code)));

    Ok(DeviceCodeResponse {
        user_code,
        device_code: data["device_code"].as_str().unwrap_or("").to_string(),
        verification_uri,
        verification_uri_complete,
        expires_in: data["expires_in"].as_i64().unwrap_or(900) as i32,
        interval: data["interval"].as_i64().unwrap_or(5) as i32,
        message: data["message"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn auth_login_poll(device_code: String) -> Result<Option<AuthState>, String> {
    let client = auth_http_client()?;
    let res = client.post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", &device_code),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if status.is_success() {
        println!("Auth device flow approved [{}], exchanging tokens.", status);

        let access_token = data["access_token"].as_str().unwrap_or("").to_string();
        let refresh_token = data["refresh_token"].as_str().unwrap_or("").to_string();

        let (mc_token, profile) = perform_mc_exchange(&client, &access_token).await?;

        return Ok(Some(AuthState {
            ms_access_token: access_token,
            ms_refresh_token: refresh_token,
            mc_access_token: mc_token,
            profile,
        }));
    }

    if let Some(err) = data.get("error").and_then(|e| e.as_str()) {
        if err == "authorization_pending" || err == "slow_down" {
            return Ok(None);
        }

        if err == "authorization_declined" {
            return Err("Sign-in was declined in the browser.".into());
        }

        if err == "expired_token" || err == "bad_verification_code" {
            return Err("Device code expired. Please try signing in again.".into());
        }

        println!("Auth poll error [{}]: {:?}", status, data);
        return Err(err.to_string());
    }

    println!("Auth poll unknown response [{}]: {:?}", status, data);
    Err("Unknown poll error".into())
}

async fn perform_mc_exchange(client: &Client, access_token: &str) -> Result<(String, MinecraftProfile), String> {
    // 1. XBL Exchange
    let xbl_req = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let xbl_http = client.post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&xbl_req)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let xbl_status = xbl_http.status();
    let xbl_res: serde_json::Value = xbl_http.json().await.map_err(|e| e.to_string())?;
    if !xbl_status.is_success() {
        return Err(format!("Xbox Live auth failed ({}).", xbl_status));
    }
    
    let xbl_token = xbl_res["Token"].as_str().ok_or("No XBL Token")?;
    let uhs = xbl_res["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or("No UHS")?;

    // 2. XSTS Exchange
    let xsts_req = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let xsts_http = client.post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&xsts_req)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let xsts_status = xsts_http.status();
    let xsts_res: serde_json::Value = xsts_http.json().await.map_err(|e| e.to_string())?;
    if !xsts_status.is_success() {
        if let Some(xerr) = xsts_res.get("XErr").and_then(|v| v.as_i64()) {
            return Err(format!("Xbox/XSTS authorization failed (XErr {xerr})."));
        }
        return Err(format!("Xbox/XSTS authorization failed ({}).", xsts_status));
    }
    
    let xsts_token = xsts_res["Token"].as_str().ok_or("No XSTS Token")?;

    // 3. Minecraft Login
    let mc_req = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", uhs, xsts_token)
    });

    let mc_http = client.post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&mc_req)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let mc_status = mc_http.status();
    let mc_res: serde_json::Value = mc_http.json().await.map_err(|e| e.to_string())?;
    if !mc_status.is_success() {
        return Err(format!("Minecraft auth failed ({}).", mc_status));
    }

    let mc_token = mc_res["access_token"].as_str().ok_or("No MC Token")?.to_string();

    let profile = fetch_minecraft_profile(client, &mc_token).await?;
    Ok((mc_token, profile))
}

async fn fetch_minecraft_profile(client: &Client, mc_access_token: &str) -> Result<MinecraftProfile, String> {
    let profile_http = client.get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let profile_status = profile_http.status();
    let profile_res: serde_json::Value = profile_http.json().await.map_err(|e| e.to_string())?;
    if !profile_status.is_success() {
        return Err(format!("Minecraft profile fetch failed ({}).", profile_status));
    }

    let uuid = profile_res["id"].as_str().ok_or("No Profile ID")?.to_string();
    let name = profile_res["name"].as_str().ok_or("No Profile Name")?.to_string();

    let skin_url = profile_res.get("skins").and_then(|s| s.as_array())
        .and_then(|s| s.first())
        .and_then(|s| s.get("url"))
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());

    Ok(MinecraftProfile { id: uuid, name, skin_url })
}

#[tauri::command]
pub async fn auth_upload_skin(
    mc_access_token: String,
    file_name: String,
    data: Vec<u8>,
    model: Option<String>,
) -> Result<SkinUploadResult, String> {
    if data.is_empty() {
        return Err("Skin file is empty.".into());
    }

    let selected_model = model.unwrap_or_else(|| "classic".to_string());
    if selected_model != "classic" && selected_model != "slim" {
        return Err("Skin model must be either 'classic' or 'slim'.".into());
    }

    let client = auth_http_client()?;
    let part = multipart::Part::bytes(data)
        .file_name(file_name)
        .mime_str("image/png")
        .map_err(|e| e.to_string())?;

    let form = multipart::Form::new()
        .text("variant", selected_model)
        .part("file", part);

    let upload = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(&mc_access_token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = upload.status();
    if !status.is_success() {
        let body = upload.text().await.unwrap_or_else(|_| String::new());
        return Err(format!("Skin upload failed ({}): {}", status, body));
    }

    let profile = fetch_minecraft_profile(&client, &mc_access_token).await?;
    Ok(SkinUploadResult { skin_url: profile.skin_url })
}

#[derive(Deserialize)]
struct MojangUser {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct SessionProperty {
    name: String,
    value: String,
}

#[derive(Deserialize)]
struct SessionProfile {
    properties: Vec<SessionProperty>,
}

#[derive(Deserialize)]
struct TexturePayload {
    textures: Option<TextureContainer>,
}

#[derive(Deserialize)]
struct TextureContainer {
    #[serde(rename = "SKIN")]
    skin: Option<SkinTexture>,
}

#[derive(Deserialize)]
struct SkinTexture {
    url: String,
    metadata: Option<SkinMetadata>,
}

#[derive(Deserialize)]
struct SkinMetadata {
    model: Option<String>,
}

#[tauri::command]
pub async fn auth_pull_skin_by_username(username: String) -> Result<PulledSkinResponse, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Err("Username cannot be empty.".into());
    }

    let client = auth_http_client()?;
    let profile_url = format!("https://api.mojang.com/users/profiles/minecraft/{}", trimmed);
    let profile_res = client
        .get(profile_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if profile_res.status().as_u16() == 204 {
        return Err("Minecraft username not found.".into());
    }
    if !profile_res.status().is_success() {
        return Err(format!("Username lookup failed ({}).", profile_res.status()));
    }

    let profile: MojangUser = profile_res.json().await.map_err(|e| e.to_string())?;

    let session_url = format!(
        "https://sessionserver.mojang.com/session/minecraft/profile/{}",
        profile.id
    );
    let session_res = client
        .get(session_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !session_res.status().is_success() {
        return Err(format!("Skin session lookup failed ({}).", session_res.status()));
    }

    let session: SessionProfile = session_res.json().await.map_err(|e| e.to_string())?;
    let textures_b64 = session
        .properties
        .iter()
        .find(|property| property.name == "textures")
        .map(|property| property.value.clone())
        .ok_or("Missing textures property for this account.")?;

    let decoded = BASE64
        .decode(textures_b64.as_bytes())
        .map_err(|e| format!("Texture payload decode failed: {e}"))?;
    let payload: TexturePayload = serde_json::from_slice(&decoded).map_err(|e| e.to_string())?;

    let skin = payload
        .textures
        .and_then(|textures| textures.skin)
        .ok_or("No skin texture found for this account.")?;

    let model = if skin
        .metadata
        .and_then(|meta| meta.model)
        .as_deref()
        == Some("slim")
    {
        "slim".to_string()
    } else {
        "classic".to_string()
    };

    let image_res = client
        .get(&skin.url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !image_res.status().is_success() {
        return Err(format!("Skin image download failed ({}).", image_res.status()));
    }
    let image_bytes = image_res.bytes().await.map_err(|e| e.to_string())?.to_vec();

    Ok(PulledSkinResponse {
        resolved_name: profile.name,
        uuid: profile.id,
        model,
        image_bytes,
    })
}
