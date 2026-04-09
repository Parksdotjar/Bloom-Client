package dev.bloom.cosmetics.mixin

import com.mojang.authlib.GameProfile
import dev.bloom.cosmetics.cosmetics.cape.BloomCapeManager
import net.minecraft.client.network.PlayerListEntry
import net.minecraft.entity.player.SkinTextures
import net.minecraft.util.AssetInfo
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.Shadow
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable

@Mixin(PlayerListEntry::class)
abstract class PlayerListEntryMixin {
    @Shadow
    abstract fun getProfile(): GameProfile

    @Inject(method = ["getSkinTextures"], at = [At("RETURN")], cancellable = true, require = 0)
    private fun bloomOverrideCapeOnEntry(cir: CallbackInfoReturnable<SkinTextures>) {
        val base = cir.returnValue ?: return
        val uuid = getProfile().id ?: return
        val bloomCape = BloomCapeManager.getCapeTexture(uuid) ?: return
        cir.returnValue = SkinTextures(
            base.body(),
            AssetInfo.TextureAssetInfo(bloomCape, bloomCape),
            base.elytra(),
            base.model(),
            base.secure()
        )
    }
}
