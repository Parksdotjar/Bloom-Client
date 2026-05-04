package dev.bloom.cosmetics.cosmetics.cape

import dev.bloom.cosmetics.cache.TextureCacheManager
import dev.bloom.cosmetics.domain.CosmeticType
import dev.bloom.cosmetics.domain.EquippedCape
import dev.bloom.cosmetics.util.BloomLog
import dev.bloom.cosmetics.util.UuidUtil
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import net.minecraft.client.MinecraftClient
import net.minecraft.client.texture.MissingSprite
import net.minecraft.util.Identifier
import java.net.URI
import java.net.URL
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class CapeStateService(private val textureCacheManager: TextureCacheManager) {
    private val equippedByUuid = ConcurrentHashMap<String, EquippedCape?>()
    private val textureByUuid = ConcurrentHashMap<String, Identifier>()
    private val animatedByUuid = ConcurrentHashMap<String, AnimatedPlayback>()
    private val animatedLastFrameByUuid = ConcurrentHashMap<String, Int>()
    private val animatedVersionByUuid = ConcurrentHashMap<String, String>()
    private val gson = Gson()
    private val manifestLoader = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "bloom-cape-manifest").apply { isDaemon = true }
    }
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .build()
    private val edgeBaseUrl: String = run {
        val raw = (System.getenv("BLOOM_SUPABASE_URL") ?: "").trim()
        if (raw.isBlank()) return@run ""
        val origin = runCatching {
            val parsed = URL(raw)
            val path = (parsed.path ?: "").replace(Regex("/+$"), "")
            val cleanPath = if (path.startsWith("/project/")) "" else path
            val port = if (parsed.port > 0) ":${parsed.port}" else ""
            "${parsed.protocol}://${parsed.host}$port$cleanPath"
        }.getOrElse { raw.replace(Regex("/+$"), "") }
        "${origin.trimEnd('/')}/functions/v1/main"
    }

    fun upsert(equippedCape: EquippedCape?) {
        if (equippedCape == null) return
        val key = UuidUtil.normalize(equippedCape.minecraftUuid)
        if (key.isBlank()) return

        equippedByUuid[key] = equippedCape
        val asset = equippedCape.asset
        if (asset == null || asset.type != CosmeticType.CAPE || asset.textureUrl.isBlank()) {
            textureByUuid.remove(key)
            animatedByUuid.remove(key)
            animatedLastFrameByUuid.remove(key)
            animatedVersionByUuid.remove(key)
            BloomCapeManager.notifyCapeUpdated(key)
            return
        }

        textureCacheManager.resolve(asset) { texture ->
            if (texture != null) {
                textureByUuid[key] = texture
                BloomCapeManager.notifyCapeUpdated(key)
            } else {
                textureByUuid.remove(key)
                BloomLog.debug("Cape texture unavailable uuid={} asset={}", key, asset.id)
                BloomCapeManager.notifyCapeUpdated(key)
            }
        }

        maybeLoadAnimatedFrames(key, asset)
    }

    fun clear(minecraftUuid: String) {
        val key = UuidUtil.normalize(minecraftUuid)
        if (key.isBlank()) return
        equippedByUuid.remove(key)
        textureByUuid.remove(key)
        animatedByUuid.remove(key)
        animatedLastFrameByUuid.remove(key)
        animatedVersionByUuid.remove(key)
        BloomCapeManager.notifyCapeUpdated(key)
    }

    fun getTexture(minecraftUuid: String): Optional<Identifier> {
        val key = UuidUtil.normalize(minecraftUuid)
        if (key.isBlank()) return Optional.empty()
        val animated = animatedByUuid[key]
        if (animated != null && animated.frames.isNotEmpty()) {
            val frameDurationMs = (1000.0 / animated.fps.toDouble()).toLong().coerceAtLeast(16L)
            val elapsed = (System.currentTimeMillis() - animated.startedAtMs).coerceAtLeast(0L)
            val frame = ((elapsed / frameDurationMs) % animated.frames.size).toInt()
            val frameTexture = animated.frames[frame]
            if (isTextureRegistered(frameTexture)) {
                val previousFrame = animatedLastFrameByUuid.put(key, frame)
                if (previousFrame == null || previousFrame != frame) {
                    // Player skin entries are cached by vanilla; nudge refresh when frame advances.
                    BloomCapeManager.notifyCapeUpdated(key)
                }
                return Optional.of(frameTexture)
            }
        }

        val cached = textureByUuid[key] ?: return Optional.empty()
        if (isTextureRegistered(cached)) {
            return Optional.of(cached)
        }

        // Resource reload may drop dynamic registrations. Re-resolve from stored asset.
        textureByUuid.remove(key)
        val equipped = equippedByUuid[key]
        val asset = equipped?.asset
        if (asset != null && asset.type == CosmeticType.CAPE && asset.textureUrl.isNotBlank()) {
            BloomLog.debug("Cape texture stale uuid={} asset={} -> re-register", key, asset.id)
            textureCacheManager.resolve(asset) { texture ->
                if (texture != null) {
                    textureByUuid[key] = texture
                    BloomCapeManager.notifyCapeUpdated(key)
                }
            }
        }
        return Optional.empty()
    }

    fun hasResolvedState(minecraftUuid: String): Boolean {
        val key = UuidUtil.normalize(minecraftUuid)
        if (key.isBlank()) return false
        return equippedByUuid.containsKey(key)
    }

    fun tickAnimationUpdates(nowMs: Long) {
        if (animatedByUuid.isEmpty()) return
        animatedByUuid.forEach { (playerKey, playback) ->
            if (playback.frames.isEmpty()) return@forEach
            val frameDurationMs = (1000.0 / playback.fps.toDouble()).toLong().coerceAtLeast(16L)
            val elapsed = (nowMs - playback.startedAtMs).coerceAtLeast(0L)
            val frame = ((elapsed / frameDurationMs) % playback.frames.size).toInt()
            val previousFrame = animatedLastFrameByUuid.put(playerKey, frame)
            if (previousFrame == null || previousFrame != frame) {
                // Force vanilla skin/cape cache refresh when frame changes.
                BloomCapeManager.notifyCapeUpdated(playerKey)
            }
        }
    }

    private fun isTextureRegistered(identifier: Identifier): Boolean {
        val client = MinecraftClient.getInstance() ?: return false
        return runCatching {
            val texture = client.textureManager.getTexture(identifier)
            texture != null && texture !is MissingSprite
        }.getOrDefault(false)
    }

    private fun maybeLoadAnimatedFrames(playerKey: String, asset: dev.bloom.cosmetics.domain.CosmeticAsset) {
        val capeIdCandidates = resolveAnimatedCapeIds(asset)
        if (capeIdCandidates.isEmpty()) {
            animatedByUuid.remove(playerKey)
            animatedVersionByUuid.remove(playerKey)
            return
        }
        val marker = "${capeIdCandidates.joinToString(",")}:${asset.version}:${asset.updatedAt.orEmpty()}:${asset.textureUrl}"
        val previous = animatedVersionByUuid[playerKey]
        if (previous == marker && animatedByUuid[playerKey] != null) return
        animatedVersionByUuid[playerKey] = marker

        manifestLoader.execute {
            runCatching {
                val resolvedCapeId = capeIdCandidates.firstNotNullOfOrNull { candidate ->
                    val manifest = fetchManifest(candidate)
                    if (manifest != null) Pair(candidate, manifest) else null
                } ?: return@runCatching

                val capeId = resolvedCapeId.first
                val manifest = resolvedCapeId.second
                val manifestFrames = manifest.frames.sortedBy { it.index }
                val frameDefs = if (manifestFrames.isNotEmpty()) {
                    manifestFrames
                } else {
                    (0 until manifest.frameCount.coerceAtLeast(0)).map { AnimatedFrameRef(index = it, blank = false) }
                }
                if (frameDefs.isEmpty()) return@runCatching
                val fps = manifest.fps.coerceIn(1, 24)
                val orderedFrames = MutableList<Identifier?>(frameDefs.size) { null }
                val remaining = java.util.concurrent.atomic.AtomicInteger(frameDefs.size)

                frameDefs.forEachIndexed { index, frame ->
                    val frameUrl = "$edgeBaseUrl/gif-cape/capes/$capeId/frames/${frame.index}"
                    val frameAsset = asset.copy(
                        id = "$capeId#${frame.index}",
                        textureUrl = frameUrl,
                        textureHash = "${asset.textureHash ?: capeId}:${frame.index}",
                        sourceType = "gif_cape_frame",
                    )
                    textureCacheManager.resolve(frameAsset) { texture ->
                        if (texture != null) {
                            orderedFrames[index] = texture
                        }
                        if (remaining.decrementAndGet() == 0) {
                            val resolved = orderedFrames.filterNotNull()
                            if (resolved.isNotEmpty()) {
                                animatedByUuid[playerKey] = AnimatedPlayback(
                                    fps = fps,
                                    frames = resolved,
                                    startedAtMs = System.currentTimeMillis(),
                                )
                                animatedLastFrameByUuid.remove(playerKey)
                                BloomLog.debug(
                                    "Animated cape playback ready uuid={} capeId={} frames={} fps={} manifestFrames={}",
                                    playerKey,
                                    capeId,
                                    resolved.size,
                                    fps,
                                    frameDefs.size
                                )
                                BloomCapeManager.notifyCapeUpdated(playerKey)
                            }
                        }
                    }
                }
            }.onFailure {
                BloomLog.debug("Animated cape manifest load failed uuid={} asset={} reason={}", playerKey, asset.id, it.toString())
            }
        }
    }

    private fun resolveAnimatedCapeIds(asset: dev.bloom.cosmetics.domain.CosmeticAsset): List<String> {
        val ids = linkedSetOf<String>()
        val uuidPattern = Regex("^[0-9a-fA-F-]{32,36}$")
        val rawId = asset.id.trim()
        if (rawId.matches(uuidPattern)) {
            ids += rawId
        }

        val url = asset.textureUrl.trim()
        if (url.isBlank()) return ids.toList()
        val parts = url.substringBefore('?').split('/').filter { it.isNotBlank() }

        // Best signal: segment directly before rev_* is the capeId.
        val revIndex = parts.indexOfFirst { it.startsWith("rev_", ignoreCase = true) }
        if (revIndex >= 1) {
            val candidate = parts[revIndex - 1].trim()
            if (candidate.matches(uuidPattern)) {
                ids += candidate
            }
        }

        // Fallback: explicit gif-cape route in URLs.
        val capesIndex = parts.indexOf("capes")
        if (capesIndex >= 0 && capesIndex + 1 < parts.size) {
            val candidate = parts[capesIndex + 1].trim()
            if (candidate.matches(uuidPattern)) {
                ids += candidate
            }
        }

        // Legacy fallback: scan all path segments for UUID-like ids.
        parts.forEach { segment ->
            val trimmed = segment.trim()
            if (trimmed.matches(uuidPattern)) {
                ids += trimmed
            }
        }

        return ids.toList()
    }

    private fun fetchManifest(capeId: String): AnimatedManifest? {
        if (edgeBaseUrl.isBlank()) return null
        val request = HttpRequest.newBuilder(URI.create("$edgeBaseUrl/gif-cape/capes/$capeId/manifest"))
            .timeout(Duration.ofSeconds(12))
            .header("Accept", "application/json")
            .GET()
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) return null
        val payload = runCatching { gson.fromJson(response.body(), ManifestEnvelope::class.java) }.getOrNull() ?: return null
        return payload.manifest
    }

    private data class ManifestEnvelope(
        @SerializedName("ok") val ok: Boolean = false,
        @SerializedName("manifest") val manifest: AnimatedManifest? = null,
    )

    private data class AnimatedManifest(
        @SerializedName("fps") val fps: Int = 10,
        @SerializedName("frameCount") val frameCount: Int = 0,
        @SerializedName("frames") val frames: List<AnimatedFrameRef> = emptyList(),
    )

    private data class AnimatedFrameRef(
        @SerializedName("index") val index: Int = 0,
        @SerializedName("blank") val blank: Boolean = false,
    )

    private data class AnimatedPlayback(
        val fps: Int,
        val frames: List<Identifier>,
        val startedAtMs: Long,
    )
}
