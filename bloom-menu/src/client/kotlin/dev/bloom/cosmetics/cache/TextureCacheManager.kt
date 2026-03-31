package dev.bloom.cosmetics.cache

import dev.bloom.cosmetics.domain.CosmeticAsset
import dev.bloom.cosmetics.util.BloomLog
import net.minecraft.client.MinecraftClient
import net.minecraft.client.texture.MissingSprite
import net.minecraft.client.texture.NativeImage
import net.minecraft.client.texture.NativeImageBackedTexture
import net.minecraft.util.Identifier
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.imageio.ImageIO
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class TextureCacheManager(
    private val memoryRegistry: MemoryTextureRegistry = MemoryTextureRegistry(),
    private val diskCache: AssetDiskCache = AssetDiskCache()
) {
    private val downloader: ExecutorService = Executors.newFixedThreadPool(2) { runnable ->
        Thread(runnable, "bloom-cosmetics-texture").apply { isDaemon = true }
    }

    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .build()

    private val pending: ConcurrentMap<String, MutableList<(Identifier?) -> Unit>> = ConcurrentHashMap()

    fun resolve(asset: CosmeticAsset, callback: (Identifier?) -> Unit) {
        val cacheKey = cacheKey(asset)
        val cached = memoryRegistry.get(cacheKey)
        if (cached != null && isTextureRegistered(cached)) {
            BloomLog.debug("Texture cache hit key={} url={}", cacheKey, asset.textureUrl)
            callback(cached)
            return
        } else if (cached != null) {
            // Dynamic textures can be dropped after client resource reloads.
            // If that happens, force a re-register from disk/network.
            memoryRegistry.remove(cacheKey)
            BloomLog.debug("Texture cache stale key={} url={} -> reloading", cacheKey, asset.textureUrl)
        }

        val listeners = pending.computeIfAbsent(cacheKey) { mutableListOf() }
        synchronized(listeners) {
            listeners.add(callback)
            if (listeners.size > 1) {
                return
            }
        }

        downloader.execute {
            val bytes = diskCache.read(cacheKey) ?: downloadTexture(asset)
            if (bytes == null || !isPng(bytes)) {
                complete(cacheKey, null)
                return@execute
            }
            val client = MinecraftClient.getInstance()
            if (client == null) {
                complete(cacheKey, null)
                return@execute
            }
            client.execute {
                val texture = registerTexture(cacheKey, bytes, asset.textureUrl)
                if (texture != null) {
                    memoryRegistry.put(cacheKey, texture)
                }
                complete(cacheKey, texture)
            }
        }
    }

    fun invalidate(asset: CosmeticAsset) {
        memoryRegistry.remove(cacheKey(asset))
    }

    fun shutdown() {
        downloader.shutdownNow()
    }

    private fun downloadTexture(asset: CosmeticAsset): ByteArray? {
        return runCatching {
            val request = HttpRequest.newBuilder(URI.create(asset.textureUrl))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "image/png,image/*;q=0.9,*/*;q=0.1")
                .GET()
                .build()
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray())
            val status = response.statusCode()
            if (status < 200 || status >= 300) {
                BloomLog.warn("Texture download non-200 status={} asset={} url={}", status, asset.id, asset.textureUrl)
                null
            } else {
                val bytes = response.body()
                val assetKind = classifyAssetKind(asset)
                BloomLog.debug(
                    "Texture download ok asset={} kind={} hash={} version={} bytes={} url={}",
                    asset.id,
                    assetKind,
                    asset.textureHash ?: "",
                    asset.version,
                    bytes.size,
                    asset.textureUrl
                )
                diskCache.write(cacheKey(asset), bytes)
                if (BloomLog.isDebugEnabled()) {
                    diskCache.writeDebugDump("${assetKind}-${asset.id}-${asset.version}-download", bytes)
                }
                bytes
            }
        }.onFailure {
            BloomLog.warn("Texture download failed asset={} url={} reason={}", asset.id, asset.textureUrl, it.toString())
        }.getOrNull()
    }

    private fun registerTexture(cacheKey: String, pngBytes: ByteArray, sourceUrl: String): Identifier? {
        return runCatching {
            val assetKind = classifyAssetKind(cacheKey, sourceUrl)
            val normalizedBytes = normalizeCapeAtlasBytes(pngBytes, cacheKey, sourceUrl)
            val image = NativeImage.read(normalizedBytes)
            val width = image.width
            val height = image.height
            if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
                BloomLog.warn("Texture decode invalid dimensions key={} size={}x{} url={}", cacheKey, width, height, sourceUrl)
                image.close()
                return null
            }
            if (width != height) {
                BloomLog.warn(
                    "Texture aspect ratio unexpected key={} kind={} size={}x{} url={}",
                    cacheKey,
                    assetKind,
                    width,
                    height,
                    sourceUrl
                )
            }
            // Resource ids here must be namespace paths, not raw file paths.
            // Minecraft will add "textures/" and ".png" when resolving asset-backed ids.
            val textureId = Identifier.of("bloomcosmetics", "cape/${cacheKey.hashCode().toUInt().toString(16)}")
            val client = MinecraftClient.getInstance() ?: return null
            client.textureManager.destroyTexture(textureId)
            val dynamic = NativeImageBackedTexture({ "bloom_cape_$cacheKey" }, image)
            client.textureManager.registerTexture(textureId, dynamic)
            BloomLog.debug(
                "Texture registered key={} kind={} size={}x{} id={} url={}",
                cacheKey,
                assetKind,
                width,
                height,
                textureId,
                sourceUrl
            )
            textureId
        }.onFailure {
            BloomLog.warn("Texture registration failed key={} url={} reason={}", cacheKey, sourceUrl, it.toString())
        }.getOrNull()
    }

    private fun normalizeCapeAtlasBytes(pngBytes: ByteArray, cacheKey: String, sourceUrl: String): ByteArray {
        return runCatching {
            val source = ImageIO.read(ByteArrayInputStream(pngBytes)) ?: return pngBytes
            if (source.width > 0 && source.width == source.height * 2) {
                val normalized = java.awt.image.BufferedImage(source.width, source.width, java.awt.image.BufferedImage.TYPE_INT_ARGB)
                val graphics = normalized.createGraphics()
                try {
                    graphics.drawImage(source, 0, 0, null)
                } finally {
                    graphics.dispose()
                }

                val out = ByteArrayOutputStream()
                ImageIO.write(normalized, "png", out)
                BloomLog.debug(
                    "Texture normalized legacy cape key={} from={}x{} to={}x{} url={}",
                    cacheKey,
                    source.width,
                    source.height,
                    normalized.width,
                    normalized.height,
                    sourceUrl
                )
                out.toByteArray()
            } else if (source.width != source.height) {
                val targetSize = min(4096, max(64, ((max(source.width, source.height) + 63) / 64) * 64))
                val atlas = java.awt.image.BufferedImage(targetSize, targetSize, java.awt.image.BufferedImage.TYPE_INT_ARGB)
                val graphics = atlas.createGraphics()
                try {
                    graphics.composite = java.awt.AlphaComposite.Src
                    graphics.color = java.awt.Color(0, 0, 0, 0)
                    graphics.fillRect(0, 0, targetSize, targetSize)

                    val front = resolveCapeRegion(targetSize, "front")
                    val back = resolveCapeRegion(targetSize, "back")
                    drawContain(graphics, source, front)
                    drawContain(graphics, source, back)
                } finally {
                    graphics.dispose()
                }

                val out = ByteArrayOutputStream()
                ImageIO.write(atlas, "png", out)
                BloomLog.debug(
                    "Texture normalized face-art key={} from={}x{} to={}x{} url={}",
                    cacheKey,
                    source.width,
                    source.height,
                    atlas.width,
                    atlas.height,
                    sourceUrl
                )
                out.toByteArray()
            } else {
                pngBytes
            }
        }.onFailure {
            BloomLog.warn("Texture legacy normalization skipped key={} url={} reason={}", cacheKey, sourceUrl, it.toString())
        }.getOrElse { pngBytes }
    }

    private data class CapeRegion(val x: Int, val y: Int, val width: Int, val height: Int)

    private fun resolveCapeRegion(size: Int, face: String): CapeRegion {
        val unit = size.toDouble() / 64.0
        val width = (10.0 * unit).roundToInt().coerceAtLeast(1)
        val height = (16.0 * unit).roundToInt().coerceAtLeast(1)
        val depth = (1.0 * unit).roundToInt().coerceAtLeast(1)
        return when (face) {
            "front" -> CapeRegion(depth, depth, width, height)
            "back" -> CapeRegion(width + (depth * 2), depth, width, height)
            else -> CapeRegion(depth, depth, width, height)
        }
    }

    private fun drawContain(
        graphics: java.awt.Graphics2D,
        source: java.awt.image.BufferedImage,
        target: CapeRegion
    ) {
        val scale = min(
            target.width.toDouble() / source.width.toDouble(),
            target.height.toDouble() / source.height.toDouble()
        )
        val drawWidth = max(1, (source.width * scale).roundToInt())
        val drawHeight = max(1, (source.height * scale).roundToInt())
        val drawX = target.x + ((target.width - drawWidth) / 2)
        val drawY = target.y + ((target.height - drawHeight) / 2)
        graphics.drawImage(source, drawX, drawY, drawWidth, drawHeight, null)
    }

    private fun complete(cacheKey: String, result: Identifier?) {
        val callbacks = pending.remove(cacheKey) ?: return
        synchronized(callbacks) {
            callbacks.forEach { cb ->
                runCatching { cb(result) }
            }
            callbacks.clear()
        }
    }

    private fun isTextureRegistered(identifier: Identifier): Boolean {
        val client = MinecraftClient.getInstance() ?: return false
        return runCatching {
            val texture = client.textureManager.getTexture(identifier)
            texture != null && texture !is MissingSprite
        }.getOrDefault(false)
    }

    private fun cacheKey(asset: CosmeticAsset): String {
        val hash = asset.textureHash?.trim().orEmpty()
        return "${asset.id}|${asset.version}|$hash|${asset.textureUrl.trim()}"
    }

    private fun isPng(bytes: ByteArray): Boolean {
        return bytes.size >= 4
            && (bytes[0].toInt() and 0xff) == 0x89
            && (bytes[1].toInt() and 0xff) == 0x50
            && (bytes[2].toInt() and 0xff) == 0x4e
            && (bytes[3].toInt() and 0xff) == 0x47
    }

    private fun classifyAssetKind(asset: CosmeticAsset): String {
        return classifyAssetKind(cacheKey(asset), asset.textureUrl)
    }

    private fun classifyAssetKind(cacheKey: String, sourceUrl: String): String {
        val lowered = "$cacheKey|$sourceUrl".lowercase()
        return when {
            "custom" in lowered || "custom-capes" in lowered -> "custom"
            "animated" in lowered -> "animated"
            else -> "static"
        }
    }
}
