package com.bloomunit.bloommenu.client.mixin;

import com.bloomunit.bloommenu.client.cosmetics.BloomCosmeticsManager;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.entity.player.SkinTextures;
import net.minecraft.util.AssetInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.Optional;

@Mixin(AbstractClientPlayerEntity.class)
abstract class AbstractClientPlayerEntityMixin {
    @Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
    private void bloom$overrideCape(CallbackInfoReturnable<SkinTextures> cir) {
        AbstractClientPlayerEntity self = (AbstractClientPlayerEntity) (Object) this;
        Optional<net.minecraft.util.Identifier> overrideTexture = BloomCosmeticsManager.getInstance().getCapeTexture(self.getUuid());
        if (overrideTexture.isEmpty()) {
            return;
        }
        SkinTextures current = cir.getReturnValue();
        AssetInfo.TextureAsset capeAsset = new AssetInfo.TextureAssetInfo(overrideTexture.get());
        SkinTextures updated = new SkinTextures(
            current.body(),
            capeAsset,
            current.elytra(),
            current.model(),
            current.secure()
        );
        cir.setReturnValue(updated);
    }
}
