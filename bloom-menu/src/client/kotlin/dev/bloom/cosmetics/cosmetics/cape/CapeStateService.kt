package dev.bloom.cosmetics.cosmetics.cape

import dev.bloom.cosmetics.cache.TextureCacheManager
import dev.bloom.cosmetics.domain.CosmeticType
import dev.bloom.cosmetics.domain.EquippedCape
import dev.bloom.cosmetics.util.BloomLog
import dev.bloom.cosmetics.util.UuidUtil
import net.minecraft.client.MinecraftClient
import net.minecraft.client.texture.MissingSprite
import net.minecraft.util.Identifier
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap

class CapeStateService(private val textureCacheManager: TextureCacheManager) {
    private val equippedByUuid = ConcurrentHashMap<String, EquippedCape?>()
    private val textureByUuid = ConcurrentHashMap<String, Identifier>()

    fun upsert(equippedCape: EquippedCape?) {
        if (equippedCape == null) return
        val key = UuidUtil.normalize(equippedCape.minecraftUuid)
        if (key.isBlank()) return

        equippedByUuid[key] = equippedCape
        val asset = equippedCape.asset
        if (asset == null || asset.type != CosmeticType.CAPE || asset.textureUrl.isBlank()) {
            textureByUuid.remove(key)
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
    }

    fun clear(minecraftUuid: String) {
        val key = UuidUtil.normalize(minecraftUuid)
        if (key.isBlank()) return
        equippedByUuid.remove(key)
        textureByUuid.remove(key)
        BloomCapeManager.notifyCapeUpdated(key)
    }

    fun getTexture(minecraftUuid: String): Optional<Identifier> {
        val key = UuidUtil.normalize(minecraftUuid)
        if (key.isBlank()) return Optional.empty()
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

    private fun isTextureRegistered(identifier: Identifier): Boolean {
        val client = MinecraftClient.getInstance() ?: return false
        return runCatching {
            val texture = client.textureManager.getTexture(identifier)
            texture != null && texture !is MissingSprite
        }.getOrDefault(false)
    }
}
