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
        nextRefreshAllowedAtMs = now + 75L

        val client = MinecraftClient.getInstance() ?: return
        client.execute {
            // Keep this intentionally non-destructive. Skin/cape state is injected
            // during render; clearing vanilla player caches causes cape flicker/hide.
            BloomLog.debug("Cape updated signal queued for uuid={}", playerUuid)
        }
    }
}
