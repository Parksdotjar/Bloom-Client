package dev.bloom.cosmetics.mixin

import dev.bloom.cosmetics.badges.BloomBadgeService
import dev.bloom.cosmetics.cosmetics.cape.BloomCapeManager
import net.minecraft.client.render.entity.state.PlayerEntityRenderState
import net.minecraft.entity.PlayerLikeEntity
import net.minecraft.entity.player.SkinTextures
import net.minecraft.util.AssetInfo
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo

@Mixin(net.minecraft.client.render.entity.PlayerEntityRenderer::class)
abstract class PlayerEntityRendererMixin {
    @Inject(
        method = ["updateRenderState(Lnet/minecraft/entity/PlayerLikeEntity;Lnet/minecraft/client/render/entity/state/PlayerEntityRenderState;F)V"],
        at = [At("TAIL")],
        require = 0
    )
    private fun bloomInjectAnimatedCapeTexture(
        entity: PlayerLikeEntity,
        state: PlayerEntityRenderState,
        tickDelta: Float,
        ci: CallbackInfo
    ) {
        val bloomCape = BloomCapeManager.getCapeTexture(entity.uuid) ?: return
        val base = state.skinTextures
        state.skinTextures = SkinTextures(
            base.body(),
            AssetInfo.TextureAssetInfo(bloomCape, bloomCape),
            base.elytra(),
            base.model(),
            base.secure()
        )
        state.capeVisible = true
    }

    @Inject(
        method = ["updateRenderState(Lnet/minecraft/entity/PlayerLikeEntity;Lnet/minecraft/client/render/entity/state/PlayerEntityRenderState;F)V"],
        at = [At("TAIL")],
        require = 0
    )
    private fun bloomInjectNameBadge(
        entity: PlayerLikeEntity,
        state: PlayerEntityRenderState,
        tickDelta: Float,
        ci: CallbackInfo
    ) {
        state.playerName = BloomBadgeService.decorateName(state.playerName, entity.uuid, BloomBadgeService.Surface.NAMETAG) ?: state.playerName
        state.displayName = BloomBadgeService.decorateName(state.displayName, entity.uuid, BloomBadgeService.Surface.NAMETAG) ?: state.displayName
    }
}

