package dev.bloom.cosmetics.net

import com.google.gson.Gson
import dev.bloom.cosmetics.bridge.BridgeLiveEventPayload
import dev.bloom.cosmetics.util.BloomLog
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class BloomWebSocketClient(
    private val wsUrl: String,
    private val bearerToken: String,
    private val connectTimeoutSeconds: Long = 6L
) {
    private val gson = Gson()
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds.coerceIn(3L, 30L)))
        .build()

    @Volatile
    private var socket: WebSocket? = null

    fun connect(onEvent: (BridgeLiveEventPayload) -> Unit, onDisconnect: (String) -> Unit) {
        close()
        val token = URLEncoder.encode(bearerToken, StandardCharsets.UTF_8)
        val uri = URI.create(wsUrl + if (wsUrl.contains("?")) "&token=$token" else "?token=$token")
        httpClient.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds.coerceIn(3L, 30L)))
            .buildAsync(uri, object : WebSocket.Listener {
                private val partial = StringBuilder()

                override fun onOpen(webSocket: WebSocket) {
                    socket = webSocket
                    BloomLog.info("Backend cosmetics websocket connected.")
                    webSocket.request(1)
                }

                override fun onText(webSocket: WebSocket, data: CharSequence, last: Boolean): CompletionStage<*> {
                    partial.append(data)
                    if (last) {
                        val payload = partial.toString()
                        partial.setLength(0)
                        runCatching { gson.fromJson(payload, BridgeLiveEventPayload::class.java) }
                            .onSuccess { parsed -> if (parsed?.type != null) onEvent(parsed) }
                            .onFailure { BloomLog.warn("Backend websocket parse failed: {}", it.toString()) }
                    }
                    webSocket.request(1)
                    return CompletableFuture.completedFuture(null)
                }

                override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String): CompletionStage<*> {
                    socket = null
                    onDisconnect("close:$statusCode:$reason")
                    return CompletableFuture.completedFuture(null)
                }

                override fun onError(webSocket: WebSocket, error: Throwable) {
                    socket = null
                    onDisconnect("error:${error.message ?: error.javaClass.simpleName}")
                }
            })
            .exceptionally {
                onDisconnect("connect_failed:${it.message ?: it.javaClass.simpleName}")
                null
            }
    }

    fun close() {
        val current = socket
        socket = null
        if (current != null) {
            runCatching { current.sendClose(WebSocket.NORMAL_CLOSURE, "client_stop") }
        }
    }
}