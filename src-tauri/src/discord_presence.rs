use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use std::sync::Mutex;
use tauri::async_runtime;

const DISCORD_APP_ID: &str = "1479146286677495839";

static PRESENCE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresencePayload {
    pub details: String,
    pub state: Option<String>,
}

fn with_client<F>(f: F) -> Result<(), String>
where
    F: FnOnce(&mut DiscordIpcClient) -> Result<(), String>,
{
    let _guard = PRESENCE_LOCK
        .lock()
        .map_err(|_| "Discord presence lock poisoned".to_string())?;

    let mut client = DiscordIpcClient::new(DISCORD_APP_ID)
        .map_err(|e| format!("Discord IPC init failed: {}", e))?;
    client
        .connect()
        .map_err(|e| format!("Discord IPC connect failed: {}", e))?;

    f(&mut client)?;

    let _ = client.close();
    Ok(())
}

#[tauri::command]
pub async fn discord_presence_set(payload: PresencePayload) -> Result<(), String> {
    async_runtime::spawn_blocking(move || {
        let mut activity = activity::Activity::new().details(&payload.details);
        if let Some(state) = payload.state.as_deref() {
            activity = activity.state(state);
        }

        with_client(|client| {
            client
                .set_activity(activity)
                .map_err(|e| format!("Discord set_activity failed: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Discord presence task failed: {}", e))?
}

#[tauri::command]
pub async fn discord_presence_clear() -> Result<(), String> {
    async_runtime::spawn_blocking(move || {
        with_client(|client| {
            client
                .clear_activity()
                .map_err(|e| format!("Discord clear_activity failed: {}", e))
        })
    })
    .await
    .map_err(|e| format!("Discord presence task failed: {}", e))?
}
