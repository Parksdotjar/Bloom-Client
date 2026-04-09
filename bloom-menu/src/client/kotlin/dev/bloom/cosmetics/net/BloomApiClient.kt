package dev.bloom.cosmetics.net

import com.google.gson.Gson
import dev.bloom.cosmetics.bridge.BridgeEquippedCapePayload
import dev.bloom.cosmetics.util.BloomLog
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.CompletableFuture

class BloomApiClient(
    private val baseUrl: String,
    private val bearerToken: String,
    private val timeoutSeconds: Long = 8L
) {
    private val gson = Gson()
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(timeoutSeconds.coerceIn(3L, 30L)))
        .build()

    fun fetchEquippedCapeByMinecraftUuid(minecraftUuid: String): CompletableFuture<BridgeEquippedCapePayload?> {
        val queryUuid = URLEncoder.encode(minecraftUuid, StandardCharsets.UTF_8)
        val uri = URI.create("${baseUrl.trimEnd('/')}/v1/cosmetics/cape/$queryUuid")
        val request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(timeoutSeconds.coerceIn(3L, 60L)))
            .header("Accept", "application/json")
            .header("Authorization", "Bearer $bearerToken")
            .GET()
            .build()
        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply { response ->
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    BloomLog.debug("Backend cape lookup non-200 uuid={} status={}", minecraftUuid, response.statusCode())
                    null
                } else {
                    runCatching { gson.fromJson(response.body(), BridgeEquippedCapePayload::class.java) }
                        .onFailure { BloomLog.warn("Backend cape decode failed uuid={} reason={}", minecraftUuid, it.toString()) }
                        .getOrNull()
                }
            }
            .exceptionally {
                BloomLog.debug("Backend cape lookup failed uuid={} reason={}", minecraftUuid, it.toString())
                null
            }
    }
}