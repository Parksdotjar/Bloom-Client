package dev.bloom.cosmetics.cosmetics.cape

import dev.bloom.cosmetics.domain.EquippedCape
import dev.bloom.cosmetics.presence.PlayerIdentityResolver
import net.minecraft.client.MinecraftClient
import net.minecraft.util.Identifier
import java.util.Optional

class CapeManager(
    private val stateService: CapeStateService,
    private val identityResolver: PlayerIdentityResolver
) {
    fun tick(client: MinecraftClient) {
        identityResolver.tick(client)
    }

    fun applyUpdate(cape: EquippedCape?) {
        if (cape == null) return
        stateService.upsert(cape)
    }

    fun clearForPlayer(uuid: String) {
        stateService.clear(uuid)
    }

    fun textureForPlayer(uuid: String): Optional<Identifier> {
        return stateService.getTexture(uuid)
    }

    fun hasResolved(uuid: String): Boolean = stateService.hasResolvedState(uuid)
}