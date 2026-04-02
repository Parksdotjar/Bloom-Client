# BLOOM COSMETICS Launcher Bridge Contract (localhost only)

The launcher must expose a localhost bridge before Minecraft starts.

Base URLs:
- HTTP: `http://127.0.0.1:18340`
- WS: `ws://127.0.0.1:18340`

Auth:
- `Authorization: Bearer <bridge_token>`
- The bridge token is injected by launcher via `BLOOM_BRIDGE_TOKEN` env var.
- Endpoints must only bind localhost.

## GET /v1/session
Returns current authenticated Bloom launcher session context for this game process.

```json
{
  "authenticated": true,
  "bloom_user_id": "uuid-or-id",
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "session_id": "bridge-session-id",
  "backend_api_base_url": "https://sb.bloomclient.org/functions/v1/main",
  "backend_ws_url": "wss://sb.bloomclient.org/realtime/v1/websocket",
  "backend_access_token": "jwt-for-mod-presence-read"
}
```

## GET /v1/cosmetics/equipped
Returns local user equipped cape state.

```json
{
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "equipped_at": "2026-03-30T20:21:00Z",
  "cape": {
    "asset_id": "cape_abc123",
    "texture_url": "https://.../cape.png",
    "texture_hash": "sha256:...",
    "version": 12,
    "source_type": "custom",
    "updated_at": "2026-03-30T20:21:00Z"
  }
}
```

If unequipped:

```json
{
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "equipped_at": "2026-03-30T20:21:00Z",
  "cape": null
}
```

## GET /v1/players/{minecraft_uuid}/cape
Returns cape state for any minecraft uuid (resolved from backend/launcher cache).

Response shape is identical to `/v1/cosmetics/equipped`.

## WS /v1/live
Local bridge live stream for local + remote updates.

Event payload:

```json
{
  "type": "player_cape_changed",
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "equipped": {
    "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
    "equipped_at": "2026-03-30T20:22:00Z",
    "cape": {
      "asset_id": "cape_abc123",
      "texture_url": "https://.../cape.png",
      "texture_hash": "sha256:...",
      "version": 13,
      "source_type": "custom",
      "updated_at": "2026-03-30T20:22:00Z"
    }
  }
}
```

Snapshot event:

```json
{
  "type": "presence_snapshot",
  "players": [
    {
      "minecraft_uuid": "uuid1",
      "equipped_at": "2026-03-30T20:22:00Z",
      "cape": { "asset_id": "...", "texture_url": "...", "texture_hash": "...", "version": 1 }
    }
  ]
}
```

Session/account change events:
- `logout`
- `session_revoked`
- `account_switched`

The mod reconnects automatically and clears stale state.