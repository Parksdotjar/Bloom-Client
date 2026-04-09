# BLOOM COSMETICS Backend Live Contract

Recommended backend responsibilities for launcher/mod ecosystem:

1. Authoritative equipped cape state per Bloom user.
2. Minecraft UUID -> Bloom user mapping.
3. Live change fanout event stream.
4. Version/hash invalidation for cape assets.

## Required event types

- `player_cape_changed`
- `presence_snapshot`
- `asset_invalidated`

### player_cape_changed

```json
{
  "type": "player_cape_changed",
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "equipped": {
    "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
    "equipped_at": "2026-03-30T20:30:00Z",
    "cape": {
      "asset_id": "cape_abc123",
      "texture_url": "https://cdn.../cape.png",
      "texture_hash": "sha256:...",
      "version": 14,
      "source_type": "custom"
    }
  }
}
```

### asset_invalidated

```json
{
  "type": "asset_invalidated",
  "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
  "equipped": {
    "minecraft_uuid": "2790c9887660460491068944f4ea2dcb",
    "cape": {
      "asset_id": "cape_abc123",
      "texture_url": "https://cdn.../cape.png",
      "texture_hash": "sha256:newhash",
      "version": 15
    }
  }
}
```

The launcher should consume backend events and relay to local bridge `/v1/live`.