package dev.bloom.cosmetics.mixin

import dev.bloom.cosmetics.cosmetics.cape.BloomCapeManager
import net.minecraft.client.network.AbstractClientPlayerEntity
import net.minecraft.client.network.PlayerListEntry
import net.minecraft.client.util.DefaultSkinHelper
import net.minecraft.entity.player.SkinTextures
import net.minecraft.util.AssetInfo
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.Shadow
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable

@Mixin(AbstractClientPlayerEntity::class)
abstract class AbstractClientPlayerEntityMixin {
    @Shadow
    protected abstract fun getPlayerListEntry(): PlayerListEntry?

    @Inject(method = ["getSkin"], at = [At("HEAD")], cancellable = true)
    private fun bloomOverrideCapeTexture(cir: CallbackInfoReturnable<SkinTextures>) {
        val self = this as AbstractClientPlayerEntity
        val bloomCape = BloomCapeManager.getCapeTexture(self.uuid)
        if (bloomCape != null) {
            val base = getPlayerListEntry()?.skinTextures ?: DefaultSkinHelper.getSkinTextures(self.uuid)
            val override = SkinTextures(
                base.body(),
                // IMPORTANT: use the two-arg ctor so Minecraft does not auto-rewrite
                // the texture path to "textures/...png" (which causes missing-resource fallback).
                AssetInfo.TextureAssetInfo(bloomCape, bloomCape),
                base.elytra(),
                base.model(),
                base.secure()
            )
            cir.returnValue = override
        }
    }
}
