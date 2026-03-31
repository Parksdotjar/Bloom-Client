package dev.bloom.cosmetics.presence

import dev.bloom.cosmetics.cosmetics.cape.CapeStateService
import dev.bloom.cosmetics.util.UuidUtil
import net.minecraft.client.MinecraftClient
import java.util.concurrent.ConcurrentHashMap

class PlayerIdentityResolver(
    private val syncService: RemoteCosmeticSyncService,
    private val capeStateService: CapeStateService
) {
    private val nextLookupAt = ConcurrentHashMap<String, Long>()
    private val negativeUntil = ConcurrentHashMap<String, Long>()

    fun tick(client: MinecraftClient) {
        val world = client.world ?: return
        val now = System.currentTimeMillis()
        for (player in world.players) {
            val uuid = UuidUtil.normalize(player.uuidAsString)
            if (uuid.isBlank()) continue
            if ((negativeUntil[uuid] ?: 0L) > now) continue
            if ((nextLookupAt[uuid] ?: 0L) > now) continue

            nextLookupAt[uuid] = now + 4_000L
            syncService.resolveCapeForPlayer(uuid).thenAccept { resolved ->
                if (!resolved) {
                    negativeUntil[uuid] = System.currentTimeMillis() + 15_000L
                } else {
                    negativeUntil.remove(uuid)
                }
            }
        }

        nextLookupAt.entries.removeIf { it.value < now - 60_000L }
        negativeUntil.entries.removeIf { it.value < now }
    }
}
