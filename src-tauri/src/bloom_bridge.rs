use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, RwLock};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as TungsteniteMessage;
use uuid::Uuid;
use crate::minecraft_prefs::read_preferences_from_disk;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 18340;

static BRIDGE_HANDLE: OnceLock<LauncherBridgeHandle> = OnceLock::new();

#[derive(Clone)]
pub struct LauncherBridgeRuntime {
    pub host: String,
    pub port: u16,
    pub token: String,
}

#[derive(Clone)]
pub struct LaunchBridgeBootstrap {
    pub minecraft_uuid: String,
    pub username: String,
    pub mc_access_token: String,
}

struct LauncherBridgeHandle {
    shared: Arc<BridgeSharedState>,
    runtime: LauncherBridgeRuntime,
}

struct BridgeSharedState {
    session: RwLock<BridgeSessionState>,
    tx: broadcast::Sender<BridgeLiveEventPayload>,
    supabase: SupabaseBridgeClient,
}

#[derive(Clone, Default)]
struct BridgeSessionState {
    authenticated: bool,
    bloom_user_id: String,
    minecraft_uuid: String,
    username: String,
    mc_access_token: String,
    session_id: String,
}

#[derive(Clone)]
struct SupabaseBridgeClient {
    http: reqwest::Client,
    rest_base_url: String,
    anon_key: String,
}

#[derive(Serialize, Clone)]
struct BridgeSessionPayload {
    authenticated: bool,
    bloom_user_id: String,
    minecraft_uuid: String,
    session_id: String,
    backend_api_base_url: Option<String>,
    backend_ws_url: Option<String>,
    backend_access_token: Option<String>,
}

#[derive(Serialize, Clone)]
struct BridgeCapeAssetPayload {
    asset_id: String,
    texture_url: String,
    texture_hash: String,
    version: i64,
    source_type: String,
    updated_at: Option<String>,
}

#[derive(Serialize, Clone)]
struct BridgeEquippedCapePayload {
    minecraft_uuid: String,
    equipped_at: Option<String>,
    role: Option<String>,
    custom_badge_key: Option<String>,
    badge_key: Option<String>,
    cape: Option<BridgeCapeAssetPayload>,
}

#[derive(Serialize, Clone)]
struct BridgeLiveEventPayload {
    #[serde(rename = "type")]
    event_type: String,
    minecraft_uuid: Option<String>,
    equipped: Option<BridgeEquippedCapePayload>,
    players: Option<Vec<BridgeEquippedCapePayload>>,
    reason: Option<String>,
}

#[derive(Serialize, Clone)]
struct BridgeClientPreferencesPayload {
    show_bloom_nametag_logo: bool,
    show_bloom_tab_logo: bool,
    show_bloom_chat_logo: bool,
    bloom_logo_side: String,
}

#[derive(Deserialize)]
struct SupabaseRow {
    mc_uuid: Option<String>,
    equipped_cape_id: Option<String>,
    cape_slug: Option<String>,
    texture_url: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseBadgeIdentityRow {
    mc_uuid: Option<String>,
    role: Option<String>,
    custom_badge_key: Option<String>,
    badge_key: Option<String>,
    updated_at: Option<String>,
}

pub async fn ensure_launcher_bridge(
    bootstrap: LaunchBridgeBootstrap,
) -> Result<LauncherBridgeRuntime, String> {
    if let Some(existing) = BRIDGE_HANDLE.get() {
        existing.shared.update_session(bootstrap).await;
        return Ok(existing.runtime.clone());
    }

    let runtime = LauncherBridgeRuntime {
        host: DEFAULT_HOST.to_string(),
        port: DEFAULT_PORT,
        token: Uuid::new_v4().to_string(),
    };

    let shared = Arc::new(BridgeSharedState::new());
    shared.update_session(bootstrap).await;

    let app_state = shared.clone();
    let bind_addr: SocketAddr = format!("{}:{}", runtime.host, runtime.port)
        .parse()
        .map_err(|e| format!("Invalid launcher bridge bind addr: {e}"))?;

    let listener = TcpListener::bind(bind_addr)
        .await
        .map_err(|e| format!("Failed to bind Bloom bridge on {}: {}", bind_addr, e))?;

    let router = Router::new()
        .route("/v1/session", get(handle_session))
        .route("/v1/client/preferences", get(handle_client_preferences))
        .route("/v1/cosmetics/equipped", get(handle_local_equipped))
        .route("/v1/players/{uuid}/cape", get(handle_player_cape))
        .route("/v1/live", get(handle_live))
        .with_state(app_state.clone());

    let handle = LauncherBridgeHandle {
        shared: app_state.clone(),
        runtime: runtime.clone(),
    };
    let _ = BRIDGE_HANDLE.set(handle);

    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("[bloom-bridge] server stopped: {error}");
        }
    });

    tauri::async_runtime::spawn(run_supabase_realtime_watch(app_state.clone()));
    tauri::async_runtime::spawn(run_local_cape_watch(app_state));

    Ok(runtime)
}

async fn handle_session(
    State(shared): State<Arc<BridgeSharedState>>,
    headers: HeaderMap,
) -> Result<Json<BridgeSessionPayload>, StatusCode> {
    authorize(&headers, None)?;
    let session = shared.session.read().await.clone();
    Ok(Json(BridgeSessionPayload {
        authenticated: session.authenticated,
        bloom_user_id: session.bloom_user_id,
        minecraft_uuid: session.minecraft_uuid,
        session_id: session.session_id,
        backend_api_base_url: None,
        backend_ws_url: None,
        backend_access_token: None,
    }))
}

async fn handle_local_equipped(
    State(shared): State<Arc<BridgeSharedState>>,
    headers: HeaderMap,
) -> Result<Json<Option<BridgeEquippedCapePayload>>, StatusCode> {
    authorize(&headers, None)?;
    let session = shared.session.read().await.clone();
    let payload = shared
        .supabase
        .fetch_equipped_cape(&session.minecraft_uuid)
        .await
        .ok()
        .flatten();
    Ok(Json(payload))
}

async fn handle_client_preferences(
    headers: HeaderMap,
) -> Result<Json<BridgeClientPreferencesPayload>, StatusCode> {
    authorize(&headers, None)?;
    let prefs = read_preferences_from_disk();
    Ok(Json(BridgeClientPreferencesPayload {
        show_bloom_nametag_logo: prefs.show_bloom_nametag_logo,
        show_bloom_tab_logo: prefs.show_bloom_tab_logo,
        show_bloom_chat_logo: prefs.show_bloom_chat_logo,
        bloom_logo_side: prefs.bloom_logo_side,
    }))
}

async fn handle_player_cape(
    State(shared): State<Arc<BridgeSharedState>>,
    AxumPath(uuid): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Json<Option<BridgeEquippedCapePayload>>, StatusCode> {
    authorize(&headers, None)?;
    let payload = shared.supabase.fetch_equipped_cape(&uuid).await.ok().flatten();
    Ok(Json(payload))
}

async fn handle_live(
    ws: WebSocketUpgrade,
    State(shared): State<Arc<BridgeSharedState>>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    let query_token = query.get("token").cloned();
    authorize(&headers, query_token)?;
    Ok(ws.on_upgrade(move |socket| websocket_loop(socket, shared)))
}

async fn websocket_loop(mut socket: WebSocket, shared: Arc<BridgeSharedState>) {
    let mut rx = shared.tx.subscribe();
    let session = shared.session.read().await.clone();

    if let Ok(initial) = shared.supabase.fetch_equipped_cape(&session.minecraft_uuid).await {
        let snapshot = BridgeLiveEventPayload {
            event_type: "presence_snapshot".to_string(),
            minecraft_uuid: Some(session.minecraft_uuid.clone()),
            equipped: None,
            players: Some(initial.into_iter().collect()),
            reason: None,
        };
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&snapshot).unwrap_or_else(|_| "{}".to_string()).into(),
            ))
            .await;
    }

    while let Ok(event) = rx.recv().await {
        let text = match serde_json::to_string(&event) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            break;
        }
    }
}

async fn run_supabase_realtime_watch(shared: Arc<BridgeSharedState>) {
    let mut backoff = 2u64;
    loop {
        let result = run_supabase_realtime_once(shared.clone()).await;
        if let Err(error) = result {
            eprintln!("[bloom-bridge] realtime disconnected: {error}");
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(30);
    }
}

async fn run_supabase_realtime_once(shared: Arc<BridgeSharedState>) -> Result<(), String> {
    let ws_url = shared.supabase.realtime_ws_url()?;
    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .map_err(|e| format!("connect_failed:{e}"))?;
    let (mut write, mut read) = ws_stream.split();

    // Subscribe to base table only.
    let join_payload = json!({
        "topic": "realtime:public:player_equipped_cosmetics",
        "event": "phx_join",
        "payload": {
            "config": {
                "broadcast": { "ack": false, "self": false },
                "presence": { "key": "" },
                "postgres_changes": [
                    { "event": "INSERT", "schema": "public", "table": "player_equipped_cosmetics" },
                    { "event": "UPDATE", "schema": "public", "table": "player_equipped_cosmetics" }
                ]
            }
        },
        "ref": "1"
    });

    write
        .send(TungsteniteMessage::Text(join_payload.to_string().into()))
        .await
        .map_err(|e| format!("join_send_failed:{e}"))?;

    let mut heartbeat_interval = tokio::time::interval(Duration::from_secs(25));
    let mut ref_counter: u64 = 2;

    loop {
        tokio::select! {
            _ = heartbeat_interval.tick() => {
                let heartbeat = json!({
                    "topic": "phoenix",
                    "event": "heartbeat",
                    "payload": {},
                    "ref": ref_counter.to_string()
                });
                ref_counter = ref_counter.saturating_add(1);
                write
                    .send(TungsteniteMessage::Text(heartbeat.to_string().into()))
                    .await
                    .map_err(|e| format!("heartbeat_failed:{e}"))?;
            }
            next = read.next() => {
                let Some(message) = next else {
                    return Err("realtime_stream_ended".to_string());
                };
                let message = message.map_err(|e| format!("realtime_read_failed:{e}"))?;
                match message {
                    TungsteniteMessage::Text(text) => {
                        if let Ok(value) = serde_json::from_str::<Value>(&text) {
                            let event = value.get("event").and_then(Value::as_str).unwrap_or_default();
                            if event.eq_ignore_ascii_case("postgres_changes") {
                                if let Some(player_uuid) = extract_player_uuid_from_realtime_event(&value) {
                                    match shared.supabase.fetch_current_cape_by_player_uuid(&player_uuid).await {
                                        Ok(Some(payload)) => {
                                            let _ = shared.tx.send(BridgeLiveEventPayload {
                                                event_type: "player_cape_changed".to_string(),
                                                minecraft_uuid: Some(payload.minecraft_uuid.clone()),
                                                equipped: Some(payload),
                                                players: None,
                                                reason: None,
                                            });
                                        }
                                        Ok(None) => {
                                            let normalized = normalize_uuid(&player_uuid);
                                            if !normalized.is_empty() {
                    let _ = shared.tx.send(BridgeLiveEventPayload {
                                                event_type: "player_cape_changed".to_string(),
                                                minecraft_uuid: Some(normalized.clone()),
                                                equipped: Some(BridgeEquippedCapePayload {
                                                    minecraft_uuid: normalized,
                                                    equipped_at: None,
                                                    role: None,
                                                    custom_badge_key: None,
                                                    badge_key: None,
                                                    cape: None,
                                                }),
                                                players: None,
                                                reason: Some("unequipped".to_string()),
                                            });
                                            }
                                        }
                                        Err(error) => {
                                            eprintln!("[bloom-bridge] realtime refresh failed: {error}");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    TungsteniteMessage::Close(_) => {
                        return Err("realtime_closed".to_string());
                    }
                    TungsteniteMessage::Ping(payload) => {
                        write
                            .send(TungsteniteMessage::Pong(payload))
                            .await
                            .map_err(|e| format!("pong_failed:{e}"))?;
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn run_local_cape_watch(shared: Arc<BridgeSharedState>) {
    let mut last_hash = String::new();
    loop {
        let session = shared.session.read().await.clone();
        if session.authenticated && !session.minecraft_uuid.is_empty() {
            match shared.supabase.fetch_equipped_cape(&session.minecraft_uuid).await {
                Ok(Some(payload)) => {
                    let next_hash = payload
                        .cape
                        .as_ref()
                        .map(|cape| cape.texture_hash.clone())
                        .unwrap_or_else(|| format!("none:{}", payload.equipped_at.clone().unwrap_or_default()));
                    if next_hash != last_hash {
                        last_hash = next_hash;
                        let _ = shared.tx.send(BridgeLiveEventPayload {
                            event_type: "local_equipped_changed".to_string(),
                            minecraft_uuid: Some(payload.minecraft_uuid.clone()),
                            equipped: Some(payload),
                            players: None,
                            reason: None,
                        });
                    }
                }
                Ok(None) => {
                    if last_hash != "none" {
                        last_hash = "none".to_string();
                        let _ = shared.tx.send(BridgeLiveEventPayload {
                            event_type: "local_equipped_changed".to_string(),
                            minecraft_uuid: Some(session.minecraft_uuid.clone()),
                            equipped: Some(BridgeEquippedCapePayload {
                                minecraft_uuid: session.minecraft_uuid.clone(),
                                equipped_at: None,
                                role: None,
                                custom_badge_key: None,
                                badge_key: None,
                                cape: None,
                            }),
                            players: None,
                            reason: None,
                        });
                    }
                }
                Err(error) => {
                    eprintln!("[bloom-bridge] local cape watch failed: {error}");
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

fn authorize(headers: &HeaderMap, query_token: Option<String>) -> Result<(), StatusCode> {
    let expected = BRIDGE_HANDLE
        .get()
        .map(|handle| handle.runtime.token.clone())
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(token) = query_token {
        if token == expected {
            return Ok(());
        }
    }

    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .unwrap_or("");

    if bearer == expected {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

impl BridgeSharedState {
    fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            session: RwLock::new(BridgeSessionState::default()),
            tx,
            supabase: SupabaseBridgeClient::new(),
        }
    }

    async fn update_session(&self, bootstrap: LaunchBridgeBootstrap) {
        let normalized_uuid = normalize_uuid(&bootstrap.minecraft_uuid);
        let mut session = self.session.write().await;
        session.authenticated = !normalized_uuid.is_empty() && !bootstrap.mc_access_token.trim().is_empty();
        session.bloom_user_id = normalized_uuid.clone();
        session.minecraft_uuid = normalized_uuid;
        session.username = bootstrap.username.trim().to_string();
        session.mc_access_token = bootstrap.mc_access_token.trim().to_string();
        session.session_id = format!("bridge-{}", Uuid::new_v4());
    }
}

impl SupabaseBridgeClient {
    fn new() -> Self {
        let raw_url = std::env::var("BLOOM_SUPABASE_URL")
            .ok()
            .or_else(|| option_env!("BLOOM_SUPABASE_URL").map(str::to_string))
            .unwrap_or_default();
        let rest_base_url = normalize_supabase_url(&raw_url);
        let rest_base_url = if rest_base_url.trim().is_empty() {
            String::new()
        } else if rest_base_url.ends_with("/rest/v1") {
            rest_base_url
        } else {
            format!("{}/rest/v1", rest_base_url.trim_end_matches('/'))
        };
        let anon_key = std::env::var("BLOOM_SUPABASE_ANON")
            .ok()
            .or_else(|| option_env!("BLOOM_SUPABASE_ANON").map(str::to_string))
            .unwrap_or_default();
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            http,
            rest_base_url,
            anon_key,
        }
    }

    fn is_configured(&self) -> bool {
        !self.rest_base_url.trim().is_empty() && !self.anon_key.trim().is_empty()
    }

    fn realtime_ws_url(&self) -> Result<String, String> {
        if !self.is_configured() {
            return Err("supabase_not_configured".to_string());
        }
        let parsed = reqwest::Url::parse(&self.rest_base_url).map_err(|e| format!("invalid_rest_url:{e}"))?;
        let host = parsed.host_str().ok_or_else(|| "missing_supabase_host".to_string())?;
        let scheme = if parsed.scheme().eq_ignore_ascii_case("https") {
            "wss"
        } else {
            "ws"
        };
        let port = parsed.port().map(|value| format!(":{value}")).unwrap_or_default();
        Ok(format!(
            "{scheme}://{host}{port}/realtime/v1/websocket?apikey={}&vsn=1.0.0",
            urlencoding::encode(&self.anon_key)
        ))
    }

    async fn fetch_equipped_cape(
        &self,
        minecraft_uuid: &str,
    ) -> Result<Option<BridgeEquippedCapePayload>, String> {
        if let Some(payload) = self.fetch_current_cape_by_player_uuid(minecraft_uuid).await? {
            return Ok(Some(payload));
        }

        self.fetch_equipped_cape_legacy(minecraft_uuid).await
    }

    async fn fetch_current_cape_by_player_uuid(
        &self,
        player_uuid: &str,
    ) -> Result<Option<BridgeEquippedCapePayload>, String> {
        let normalized = normalize_uuid(player_uuid);
        if normalized.is_empty() || !self.is_configured() {
            return Ok(None);
        }

        let identity = self.fetch_badge_identity_by_player_uuid(&normalized).await?;

        let dashed = dashed_uuid(&normalized);
        let filter_value = format!("(player_uuid.eq.{dashed},player_uuid.eq.{normalized})");
        let filter = urlencoding::encode(&filter_value);
        let url = format!(
            "{}/v_player_current_cape?select=*&or={}&limit=1",
            self.rest_base_url, filter
        );

        let response = self
            .http
            .get(url)
            .header("Accept", "application/json")
            .header("apikey", &self.anon_key)
            .header("Authorization", format!("Bearer {}", self.anon_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let rows = response
            .json::<Vec<Value>>()
            .await
            .map_err(|e| e.to_string())?;
        let maybe_row = rows.into_iter().next();
        if maybe_row.is_none() && identity.is_none() {
            return Ok(None);
        }
        let row = maybe_row.unwrap_or(Value::Null);
        let identity_uuid = identity
            .as_ref()
            .and_then(|row| row.mc_uuid.as_deref())
            .map(normalize_uuid)
            .filter(|value| !value.is_empty());
        let row_uuid = if row.is_null() {
            identity_uuid.unwrap_or_else(|| normalized.clone())
        } else {
            json_string_any(&row, &["player_uuid", "minecraft_uuid", "mc_uuid"])
                .map(|value| normalize_uuid(&value))
                .filter(|value| !value.is_empty())
                .or(identity_uuid)
                .unwrap_or_else(|| normalized.clone())
        };
        let role = identity
            .as_ref()
            .and_then(|item| item.role.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });
        let custom_badge_key = identity
            .as_ref()
            .and_then(|item| item.custom_badge_key.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });
        let badge_key = identity
            .as_ref()
            .and_then(|item| item.badge_key.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });

        let texture_url = json_string_any(&row, &["signed_url", "texture_url", "cape_url", "asset_url"])
            .unwrap_or_default();
        let asset_id = json_string_any(&row, &["equipped_cape_id", "cosmetic_asset_id", "cape_id"])
            .unwrap_or_default();
        let slug = json_string_any(&row, &["cape_slug", "slug"]).unwrap_or_else(|| "cape".to_string());
        let updated_at = json_string_any(&row, &["equipped_updated_at", "updated_at", "asset_updated_at"])
            .or_else(|| identity.as_ref().and_then(|item| item.updated_at.clone()));

        if texture_url.trim().is_empty() || asset_id.trim().is_empty() {
            return Ok(Some(BridgeEquippedCapePayload {
                minecraft_uuid: row_uuid,
                equipped_at: updated_at,
                role,
                custom_badge_key,
                badge_key,
                cape: None,
            }));
        }

        let version = updated_at
            .as_deref()
            .map(version_from_text)
            .unwrap_or_else(current_time_millis);

        Ok(Some(BridgeEquippedCapePayload {
            minecraft_uuid: row_uuid,
            equipped_at: updated_at.clone(),
            role,
            custom_badge_key,
            badge_key,
            cape: Some(BridgeCapeAssetPayload {
                asset_id,
                texture_url: texture_url.trim().to_string(),
                texture_hash: format!("{slug}:{version}"),
                version,
                source_type: "realtime_view_lookup".to_string(),
                updated_at,
            }),
        }))
    }

    async fn fetch_equipped_cape_legacy(
        &self,
        minecraft_uuid: &str,
    ) -> Result<Option<BridgeEquippedCapePayload>, String> {
        let normalized = normalize_uuid(minecraft_uuid);
        if normalized.is_empty() || !self.is_configured() {
            return Ok(None);
        }
        let identity = self.fetch_badge_identity_by_player_uuid(&normalized).await?;
        let dashed = dashed_uuid(&normalized);
        let select = urlencoding::encode("mc_uuid,equipped_cape_id,cape_slug,texture_url,updated_at");
        let filter_value = format!("(mc_uuid.eq.{dashed},mc_uuid.eq.{normalized})");
        let filter = urlencoding::encode(&filter_value);
        let url = format!(
            "{}/commerce_cape_loadout_public?select={}&or={}&limit=1",
            self.rest_base_url, select, filter
        );

        let response = self
            .http
            .get(url)
            .header("Accept", "application/json")
            .header("apikey", &self.anon_key)
            .header("Authorization", format!("Bearer {}", self.anon_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let rows = response
            .json::<Vec<SupabaseRow>>()
            .await
            .map_err(|e| e.to_string())?;
        let maybe_row = rows.into_iter().next();
        if maybe_row.is_none() && identity.is_none() {
            return Ok(None);
        }
        let role = identity
            .as_ref()
            .and_then(|item| item.role.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });
        let custom_badge_key = identity
            .as_ref()
            .and_then(|item| item.custom_badge_key.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });
        let badge_key = identity
            .as_ref()
            .and_then(|item| item.badge_key.clone())
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            });
        let Some(row) = maybe_row else {
            return Ok(Some(BridgeEquippedCapePayload {
                minecraft_uuid: identity
                    .as_ref()
                    .and_then(|item| item.mc_uuid.as_deref())
                    .map(normalize_uuid)
                    .filter(|value| !value.is_empty())
                    .unwrap_or(normalized),
                equipped_at: identity.as_ref().and_then(|item| item.updated_at.clone()),
                role,
                custom_badge_key,
                badge_key,
                cape: None,
            }));
        };

        let row_uuid = normalize_uuid(row.mc_uuid.as_deref().unwrap_or(&normalized));
        let texture_url = row.texture_url.unwrap_or_default().trim().to_string();
        let equipped_cape_id = row.equipped_cape_id.unwrap_or_default().trim().to_string();
        let updated_at = row.updated_at.clone();
        let equipped_at = updated_at.clone();

        if texture_url.is_empty() || equipped_cape_id.is_empty() {
            return Ok(Some(BridgeEquippedCapePayload {
                minecraft_uuid: row_uuid,
                equipped_at,
                role,
                custom_badge_key,
                badge_key,
                cape: None,
            }));
        }

        let version = updated_at
            .as_deref()
            .map(version_from_text)
            .unwrap_or_else(current_time_millis);
        let slug = row.cape_slug.unwrap_or_else(|| "cape".to_string());

        Ok(Some(BridgeEquippedCapePayload {
            minecraft_uuid: row_uuid,
            equipped_at,
            role,
            custom_badge_key,
            badge_key,
            cape: Some(BridgeCapeAssetPayload {
                asset_id: equipped_cape_id,
                texture_url,
                texture_hash: format!("{slug}:{version}"),
                version,
                source_type: "launcher_bridge".to_string(),
                updated_at,
            }),
        }))
    }

    async fn fetch_badge_identity_by_player_uuid(
        &self,
        player_uuid: &str,
    ) -> Result<Option<SupabaseBadgeIdentityRow>, String> {
        let normalized = normalize_uuid(player_uuid);
        if normalized.is_empty() {
            return Ok(None);
        }
        let dashed = dashed_uuid(&normalized);
        let select = urlencoding::encode("mc_uuid,role,custom_badge_key,badge_key,updated_at");
        let filter_value = format!("(mc_uuid.eq.{dashed},mc_uuid.eq.{normalized})");
        let filter = urlencoding::encode(&filter_value);
        let url = format!(
            "{}/bloom_player_identity_public?select={}&or={}&limit=1",
            self.rest_base_url, select, filter
        );

        let response = self
            .http
            .get(url)
            .header("Accept", "application/json")
            .header("apikey", &self.anon_key)
            .header("Authorization", format!("Bearer {}", self.anon_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let rows = response
            .json::<Vec<SupabaseBadgeIdentityRow>>()
            .await
            .map_err(|e| e.to_string())?;
        Ok(rows.into_iter().next())
    }
}

fn extract_player_uuid_from_realtime_event(message: &Value) -> Option<String> {
    let payload = message.get("payload")?;
    let candidates = [
        payload.pointer("/data/record/player_uuid"),
        payload.pointer("/data/new/player_uuid"),
        payload.pointer("/record/player_uuid"),
        payload.pointer("/new/player_uuid"),
        payload.get("player_uuid"),
    ];

    for candidate in candidates.into_iter().flatten() {
        if let Some(raw) = candidate.as_str() {
            let normalized = normalize_uuid(raw);
            if !normalized.is_empty() {
                return Some(normalized);
            }
        }
    }
    None
}

fn json_string_any(row: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = row.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn normalize_supabase_url(raw: &str) -> String {
    match reqwest::Url::parse(raw.trim()) {
        Ok(parsed) => {
            let path = parsed.path().trim_end_matches('/');
            if path.starts_with("/project/") {
                format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or_default())
            } else {
                let host = parsed.host_str().unwrap_or_default();
                let port = parsed.port().map(|value| format!(":{value}")).unwrap_or_default();
                format!("{}://{}{}{}", parsed.scheme(), host, port, path)
            }
        }
        Err(_) => raw.trim().trim_end_matches('/').to_string(),
    }
}

fn normalize_uuid(value: &str) -> String {
    value.trim().replace('-', "").to_lowercase()
}

fn dashed_uuid(normalized: &str) -> String {
    if normalized.len() != 32 {
        return normalized.to_string();
    }
    format!(
        "{}-{}-{}-{}-{}",
        &normalized[0..8],
        &normalized[8..12],
        &normalized[12..16],
        &normalized[16..20],
        &normalized[20..32]
    )
}

fn version_from_text(value: &str) -> i64 {
    let mut hash: u64 = 1469598103934665603;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    (hash & i64::MAX as u64) as i64
}

fn current_time_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis() as i64
}
