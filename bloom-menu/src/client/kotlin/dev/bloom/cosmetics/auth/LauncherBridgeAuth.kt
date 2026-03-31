package dev.bloom.cosmetics.auth

data class LauncherBridgeAuth(
    val baseHttpUrl: String,
    val baseWsUrl: String,
    val token: String,
    val connectTimeoutSeconds: Long,
    val requestTimeoutSeconds: Long
) {
    companion object {
        fun fromEnvironment(): LauncherBridgeAuth {
            val host = (System.getenv("BLOOM_BRIDGE_HOST") ?: "127.0.0.1").trim()
            val port = (System.getenv("BLOOM_BRIDGE_PORT") ?: "18340").trim()
            val httpBase = System.getenv("BLOOM_BRIDGE_HTTP")?.trim()?.ifBlank { null }
                ?: "http://$host:$port"
            val wsBase = System.getenv("BLOOM_BRIDGE_WS")?.trim()?.ifBlank { null }
                ?: httpBase.replaceFirst("http://", "ws://").replaceFirst("https://", "wss://")
            val token = (System.getenv("BLOOM_BRIDGE_TOKEN") ?: System.getProperty("bloom.bridge.token") ?: "").trim()
            val connectTimeout = (System.getenv("BLOOM_BRIDGE_CONNECT_TIMEOUT") ?: "5").toLongOrNull() ?: 5L
            val requestTimeout = (System.getenv("BLOOM_BRIDGE_REQUEST_TIMEOUT") ?: "8").toLongOrNull() ?: 8L
            return LauncherBridgeAuth(
                baseHttpUrl = httpBase.trimEnd('/'),
                baseWsUrl = wsBase.trimEnd('/'),
                token = token,
                connectTimeoutSeconds = connectTimeout.coerceIn(2L, 30L),
                requestTimeoutSeconds = requestTimeout.coerceIn(3L, 60L)
            )
        }
    }
}