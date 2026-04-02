package dev.bloom.cosmetics.mixin.badges

import dev.bloom.cosmetics.client.badges.BadgeSystem
import dev.bloom.cosmetics.client.badges.render.ChatBadgeScaffold
import net.minecraft.client.gui.hud.ChatHud
import net.minecraft.text.Text
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo

@Mixin(ChatHud::class)
abstract class ChatHudMixin {
    @Inject(method = ["addMessage(Lnet/minecraft/text/Text;)V"], at = [At("HEAD")])
    private fun bloomChatBadgeScaffold(message: Text, ci: CallbackInfo) {
        val config = BadgeSystem.config()
        if (!config.enableBadges || !config.renderBadgesInChat) {
            return
        }
        ChatBadgeScaffold.maybeDecorateIncoming(message)
    }
}
