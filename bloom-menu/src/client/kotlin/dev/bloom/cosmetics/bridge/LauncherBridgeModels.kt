package dev.bloom.cosmetics.bridge

import com.google.gson.annotations.SerializedName

data class BridgeSessionPayload(
    @SerializedName("authenticated") val authenticated: Boolean = false,
    @SerializedName("bloom_user_id") val bloomUserId: String? = null,
    @SerializedName("minecraft_uuid") val minecraftUuid: String? = null,
    @SerializedName("session_id") val sessionId: String? = null,
    @SerializedName("backend_api_base_url") val backendApiBaseUrl: String? = null,
    @SerializedName("backend_ws_url") val backendWsUrl: String? = null,
    @SerializedName("backend_access_token") val backendAccessToken: String? = null
)

data class BridgeCapeAssetPayload(
    @SerializedName("asset_id") val assetId: String? = null,
    @SerializedName("texture_url") val textureUrl: String? = null,
    @SerializedName("texture_hash") val textureHash: String? = null,
    @SerializedName("version") val version: Long? = null,
    @SerializedName("source_type") val sourceType: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
)

data class BridgeEquippedCapePayload(
    @SerializedName("minecraft_uuid") val minecraftUuid: String? = null,
    @SerializedName("equipped_at") val equippedAt: String? = null,
    @SerializedName("role") val role: String? = null,
    @SerializedName("custom_badge_key") val customBadgeKey: String? = null,
    @SerializedName("badge_key") val badgeKey: String? = null,
    @SerializedName("cape") val cape: BridgeCapeAssetPayload? = null
)

data class BridgeLiveEventPayload(
    @SerializedName("type") val type: String? = null,
    @SerializedName("minecraft_uuid") val minecraftUuid: String? = null,
    @SerializedName("equipped") val equipped: BridgeEquippedCapePayload? = null,
    @SerializedName("players") val players: List<BridgeEquippedCapePayload>? = null,
    @SerializedName("reason") val reason: String? = null
)

data class BridgeClientPreferencesPayload(
    @SerializedName("show_bloom_nametag_logo") val showBloomNametagLogo: Boolean = true,
    @SerializedName("show_bloom_tab_logo") val showBloomTabLogo: Boolean = true,
    @SerializedName("show_bloom_chat_logo") val showBloomChatLogo: Boolean = true,
    @SerializedName("bloom_logo_side") val bloomLogoSide: String = "right"
)
