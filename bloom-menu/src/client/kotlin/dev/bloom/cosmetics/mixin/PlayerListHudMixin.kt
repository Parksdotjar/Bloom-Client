package dev.bloom.cosmetics.mixin

import dev.bloom.cosmetics.badges.BloomBadgeService
import net.minecraft.client.gui.hud.PlayerListHud
import net.minecraft.client.network.PlayerListEntry
import net.minecraft.text.Text
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable

@Mixin(PlayerListHud::class)
abstract class PlayerListHudMixin {
    @Inject(method = ["getPlayerName"], at = [At("RETURN")], cancellable = true, require = 0)
    private fun bloomDecorateTabName(entry: PlayerListEntry, cir: CallbackInfoReturnable<Text>) {
        val profile = entry.profile ?: return
        val uuid = profile.id ?: return
        val base = cir.returnValue ?: return
        cir.returnValue = BloomBadgeService.decorateName(base, uuid, BloomBadgeService.Surface.TAB_LIST)
    }
}
