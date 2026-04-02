package dev.bloom.cosmetics.client.badges.render

import dev.bloom.cosmetics.client.badges.registry.BadgeRegistry
import dev.bloom.cosmetics.util.BloomLog
import net.minecraft.client.MinecraftClient

/**
 * Placeholder texture manager boundary.
 * Current badge rendering uses a bitmap font atlas for perfect alignment in
 * world/tab text contexts. This manager exists so future direct texture
 * rendering paths can preload and validate badge sprite assets.
 */
class BadgeTextureManager(
    private val badgeRegistry: BadgeRegistry
) {
    fun warmup() {
        val client = MinecraftClient.getInstance() ?: return
        val textureManager = client.textureManager
        badgeRegistry.getAll().forEach { definition ->
            runCatching { textureManager.getTexture(definition.texture) }
                .onFailure {
                    BloomLog.debug(
                        "Badge texture lazy-load pending id={} texture={} reason={}",
                        definition.id,
                        definition.texture.toString(),
                        it.toString()
                    )
                }
        }
    }
}

