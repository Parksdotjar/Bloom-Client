package dev.bloom.cosmetics.mixin

import dev.bloom.cosmetics.badges.BloomBadgeService
import net.minecraft.text.Text
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.ModifyVariable

@Mixin(net.minecraft.client.gui.hud.ChatHud::class)
abstract class ChatHudMixin {
    @ModifyVariable(
        method = ["addMessage(Lnet/minecraft/text/Text;)V"],
        at = At("HEAD"),
        argsOnly = true,
        require = 0
    )
    private fun bloomDecorateSimpleChatMessage(message: Text): Text {
        return BloomBadgeService.decorateChatLine(message)
    }

    @ModifyVariable(
        method = ["addMessage(Lnet/minecraft/text/Text;Lnet/minecraft/network/message/MessageSignatureData;Lnet/minecraft/client/gui/hud/MessageIndicator;)V"],
        at = At("HEAD"),
        argsOnly = true,
        require = 0
    )
    private fun bloomDecorateRichChatMessage(message: Text): Text {
        return BloomBadgeService.decorateChatLine(message)
    }
}
