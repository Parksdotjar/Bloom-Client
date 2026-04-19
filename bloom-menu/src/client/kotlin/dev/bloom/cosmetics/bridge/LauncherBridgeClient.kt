package dev.bloom.cosmetics.bridge

import com.google.gson.Gson
import dev.bloom.cosmetics.auth.LauncherBridgeAuth
import dev.bloom.cosmetics.util.BloomLog
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.http.WebSocket
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class LauncherBridgeClient(private val auth: LauncherBridgeAuth) {
    private val gson = Gson()
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(auth.connectTimeoutSeconds))
        .build()

    @Volatile
    private var liveSocket: WebSocket? = null

    fun fetchSession(): CompletableFuture<BridgeSessionPayload?> {
        return getJson("/v1/session", BridgeSessionPayload::class.java)
    }

    fun fetchLocalEquippedCape(): CompletableFuture<BridgeEquippedCapePayload?> {
        return getJson("/v1/cosmetics/equipped", BridgeEquippedCapePayload::class.java)
    }

    fun fetchClientPreferences(): CompletableFuture<BridgeClientPreferencesPayload?> {
        return getJson("/v1/client/preferences", BridgeClientPreferencesPayload::class.java)
    }

    fun fetchPlayerCape(minecraftUuid: String): CompletableFuture<BridgeEquippedCapePayload?> {
        val encodedUuid = URLEncoder.encode(minecraftUuid, StandardCharsets.UTF_8)
        return getJson("/v1/players/$encodedUuid/cape", BridgeEquippedCapePayload::class.java)
    }

    fun openLive(
        onEvent: (BridgeLiveEventPayload) -> Unit,
        onDisconnect: (String) -> Unit
    ) {
        closeLive()
        val tokenQuery = if (auth.token.isBlank()) "" else "token=${encode(auth.token)}"
        val uri = URI.create("${auth.baseWsUrl}/v1/live" + if (tokenQuery.isBlank()) "" else "?$tokenQuery")
        httpClient.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(auth.connectTimeoutSeconds))
            .buildAsync(uri, object : WebSocket.Listener {
                private val partial = StringBuilder()

                override fun onOpen(webSocket: WebSocket) {
                    liveSocket = webSocket
                    BloomLog.info("Launcher bridge live socket connected.")
                    webSocket.request(1)
                }

                override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*> {
                    partial.append(data)
                    if (last) {
                        val text = partial.toString()
                        partial.setLength(0)
                        try {
                            val parsed = gson.fromJson(text, BridgeLiveEventPayload::class.java)
                            if (parsed?.type != null) {
                                onEvent(parsed)
                            }
                        } catch (error: Exception) {
                            BloomLog.warn("Bridge live payload parse failed: {}", error.toString())
                        }
                    }
                    webSocket.request(1)
                    return CompletableFuture.completedFuture(null)
                }

                override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*> {
                    liveSocket = null
                    onDisconnect("close:$statusCode:$reason")
                    return CompletableFuture.completedFuture(null)
                }

                override fun onError(webSocket: WebSocket, error: Throwable) {
                    liveSocket = null
                    onDisconnect("error:${error.message ?: error.javaClass.simpleName}")
                }
            })
            .exceptionally {
                onDisconnect("connect_failed:${it.message ?: it.javaClass.simpleName}")
                null
            }
    }

    fun closeLive() {
        val socket = liveSocket
        liveSocket = null
        if (socket != null) {
            try {
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "client_stop")
            } catch (_: Exception) {
            }
        }
    }

    private fun <T> getJson(path: String, cls: Class<T>): CompletableFuture<T?> {
        val uri = URI.create("${auth.baseHttpUrl}$path")
        val builder = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(auth.requestTimeoutSeconds))
            .header("Accept", "application/json")
            .GET()
        if (auth.token.isNotBlank()) {
            builder.header("Authorization", "Bearer ${auth.token}")
        }
        val request = builder.build()
        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply { response ->
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    BloomLog.warn("Bridge request failed path={} status={}", path, response.statusCode())
                    null
                } else {
                    try {
                        gson.fromJson(response.body(), cls)
                    } catch (error: Exception) {
                        BloomLog.warn("Bridge JSON decode failed path={} reason={}", path, error.toString())
                        null
                    }
                }
            }
            .exceptionally {
                BloomLog.warn("Bridge request failed path={} reason={}", path, it.toString())
                null
            }
    }

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)
}
