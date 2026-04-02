package dev.bloom.cosmetics.domain

data class BloomSession(
    val bridgeToken: String,
    val bloomUserId: String,
    val minecraftUuid: String,
    val authenticated: Boolean,
    val backendApiBaseUrl: String? = null,
    val backendWebSocketUrl: String? = null,
    val backendAccessToken: String? = null,
    val sessionId: String? = null
)