package dev.bloom.cosmetics.net

import com.google.gson.Gson
import dev.bloom.cosmetics.bridge.BridgeCapeAssetPayload
import dev.bloom.cosmetics.bridge.BridgeEquippedCapePayload
import dev.bloom.cosmetics.util.BloomLog
import dev.bloom.cosmetics.util.UuidUtil
import java.net.URI
import java.net.URLEncoder
import java.net.URL
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.OffsetDateTime
import java.util.concurrent.CompletableFuture

data class SupabasePublicAuth(
    val restBaseUrl: String,
    val anonKey: String,
    val timeoutSeconds: Long
) {
    companion object {
        fun fromEnvironment(): SupabasePublicAuth {
            val rawBase = (System.getenv("BLOOM_SUPABASE_URL") ?: "").trim()
            val anon = (System.getenv("BLOOM_SUPABASE_ANON") ?: "").trim()
            val timeout = (System.getenv("BLOOM_SUPABASE_TIMEOUT") ?: "10").toLongOrNull() ?: 10L
            val normalized = normalizeSupabaseUrl(rawBase)
            val restBase = if (normalized.isBlank() || normalized.endsWith("/rest/v1")) normalized else "$normalized/rest/v1"
            return SupabasePublicAuth(restBase, anon, timeout.coerceIn(4L, 45L))
        }

        private fun normalizeSupabaseUrl(raw: String): String {
            return runCatching {
                val parsed = URL(raw)
                val path = (parsed.path ?: "").replace(Regex("/+$"), "")
                val cleanPath = if (path.startsWith("/project/")) "" else path
                val port = if (parsed.port > 0) ":${parsed.port}" else ""
                "${parsed.protocol}://${parsed.host}$port$cleanPath"
            }.getOrElse {
                raw.replace(Regex("/+$"), "")
            }
        }
    }
}

class SupabasePublicCapeClient(private val auth: SupabasePublicAuth) {
    private val gson = Gson()
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(auth.timeoutSeconds))
        .build()

    fun fetchEquippedCapeByMinecraftUuid(minecraftUuid: String): CompletableFuture<BridgeEquippedCapePayload?> {
        val normalized = UuidUtil.normalize(minecraftUuid)
        if (normalized.isBlank()) return CompletableFuture.completedFuture(null)
        if (auth.restBaseUrl.isBlank() || auth.anonKey.isBlank()) return CompletableFuture.completedFuture(null)
        val dashed = UuidUtil.toDashed(normalized)
        val select = encode("mc_uuid,equipped_cape_id,cape_slug,cape_name,texture_url,updated_at")
        val filter = encode("(mc_uuid.eq.$dashed,mc_uuid.eq.$normalized)")
        val uri = URI.create("${auth.restBaseUrl}/commerce_cape_loadout_public?select=$select&or=$filter&limit=1")

        val request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(auth.timeoutSeconds))
            .header("Accept", "application/json")
            .header("apikey", auth.anonKey)
            .header("Authorization", "Bearer ${auth.anonKey}")
            .GET()
            .build()

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenApply { response ->
                if (response.statusCode() !in 200..299) {
                    BloomLog.debug("Supabase public loadout non-200 uuid={} status={}", normalized, response.statusCode())
                    return@thenApply null
                }
                val rows = runCatching { gson.fromJson(response.body(), Array<Row>::class.java)?.toList().orEmpty() }
                    .onFailure {
                        BloomLog.warn("Supabase loadout decode failed uuid={} reason={}", normalized, it.toString())
                    }
                    .getOrElse { emptyList() }
                val row = rows.firstOrNull() ?: return@thenApply null
                val rowUuid = UuidUtil.normalize(row.mc_uuid ?: normalized)
                val texture = row.texture_url?.trim().orEmpty()
                val capeId = row.equipped_cape_id?.trim().orEmpty()
                if (capeId.isBlank() || texture.isBlank()) {
                    BridgeEquippedCapePayload(
                        minecraftUuid = if (rowUuid.isBlank()) normalized else rowUuid,
                        equippedAt = row.updated_at,
                        cape = null
                    )
                } else {
                    val version = parseVersion(row.updated_at)
                    BridgeEquippedCapePayload(
                        minecraftUuid = if (rowUuid.isBlank()) normalized else rowUuid,
                        equippedAt = row.updated_at,
                        cape = BridgeCapeAssetPayload(
                            assetId = capeId,
                            textureUrl = texture,
                            textureHash = "${row.cape_slug ?: "cape"}:$version",
                            version = version,
                            sourceType = if (row.cape_slug?.startsWith("gif-") == true) "gif_cape_public" else "bloom_public",
                            updatedAt = row.updated_at
                        )
                    )
                }
            }
            .exceptionally {
                BloomLog.debug("Supabase public loadout request failed uuid={} reason={}", normalized, it.toString())
                null
            }
    }

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun parseVersion(updatedAt: String?): Long {
        return runCatching {
            if (updatedAt.isNullOrBlank()) return@runCatching System.currentTimeMillis()
            OffsetDateTime.parse(updatedAt).toInstant().toEpochMilli()
        }.getOrElse { System.currentTimeMillis() }
    }

    private data class Row(
        val mc_uuid: String? = null,
        val equipped_cape_id: String? = null,
        val cape_slug: String? = null,
        val cape_name: String? = null,
        val texture_url: String? = null,
        val updated_at: String? = null
    )
}
