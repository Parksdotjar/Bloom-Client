package dev.bloom.cosmetics.cosmetics.cape

import dev.bloom.cosmetics.BloomCosmeticsRuntime
import dev.bloom.cosmetics.util.BloomLog
import net.minecraft.client.MinecraftClient
import net.minecraft.util.Identifier
import java.util.UUID

object BloomCapeManager {
    @Volatile
    private var nextRefreshAllowedAtMs: Long = 0L

    fun getCapeTexture(playerUuid: UUID): Identifier? {
        return BloomCosmeticsRuntime.capeTextureFor(playerUuid.toString()).orElse(null)
    }

    fun notifyCapeUpdated(playerUuid: String) {
        val now = System.currentTimeMillis()
        if (now < nextRefreshAllowedAtMs) {
            return
        }
        nextRefreshAllowedAtMs = now + 350L

        val client = MinecraftClient.getInstance() ?: return
        client.execute {
            runCatching {
                val handler = client.networkHandler ?: return@runCatching
                val field = handler.javaClass.declaredFields.firstOrNull {
                    java.util.Map::class.java.isAssignableFrom(it.type) && it.name.contains("playerListEntries", ignoreCase = true)
                }
                if (field != null) {
                    field.isAccessible = true
                    val value = field.get(handler)
                    @Suppress("UNCHECKED_CAST")
                    val map = value as? MutableMap<Any, Any>
                    map?.clear()
                }
            }.onFailure {
                BloomLog.debug("Player list refresh skipped reason={}", it.toString())
            }
        }
    }
}