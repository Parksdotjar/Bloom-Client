package dev.bloom.cosmetics.client.badges.render

import dev.bloom.cosmetics.util.BloomLog
import net.minecraft.client.MinecraftClient
import net.minecraft.client.texture.NativeImage
import net.minecraft.util.Identifier
import java.util.concurrent.ConcurrentHashMap

class TabBadgeIconRenderer {
    private val infoCache = ConcurrentHashMap<Identifier, TextureInfo>()

    fun textureInfo(texture: Identifier): TextureInfo {
        return infoCache.computeIfAbsent(texture) { resolveTextureInfo(it) }
    }

    fun invalidate() {
        infoCache.clear()
    }

    private fun resolveTextureInfo(texture: Identifier): TextureInfo {
        val client = MinecraftClient.getInstance() ?: return TextureInfo(false, 0, 0)
        val resource = client.resourceManager.getResource(texture).orElse(null)
            ?: return TextureInfo(false, 0, 0)

        return runCatching {
            resource.inputStream.use { stream ->
                val image = NativeImage.read(stream)
                try {
                    TextureInfo(true, image.width, image.height)
                } finally {
                    image.close()
                }
            }
        }.onFailure {
            BloomLog.debug(
                "Badge icon load failed texture={} reason={}",
                texture.toString(),
                it.toString()
            )
        }.getOrElse { TextureInfo(false, 0, 0) }
    }

    data class TextureInfo(
        val available: Boolean,
        val width: Int,
        val height: Int
    )
}
