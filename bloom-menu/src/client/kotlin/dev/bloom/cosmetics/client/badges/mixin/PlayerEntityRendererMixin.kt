package dev.bloom.cosmetics.mixin.badges

import dev.bloom.cosmetics.client.badges.BadgeSystem
import dev.bloom.cosmetics.client.badges.api.BadgeRenderTarget
import net.minecraft.text.Style
import net.minecraft.text.StyleSpriteSource
import net.minecraft.text.Text
import net.minecraft.util.Identifier
import net.minecraft.client.render.entity.PlayerEntityRenderer
import net.minecraft.client.render.entity.state.PlayerEntityRenderState
import net.minecraft.entity.PlayerLikeEntity
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo

@Mixin(PlayerEntityRenderer::class)
abstract class PlayerEntityRendererMixin {
    @org.spongepowered.asm.mixin.Unique
    private val worldBadgeFont: Identifier = Identifier.of("bloomclient", "badge_icon")

    @org.spongepowered.asm.mixin.Unique
    private val worldBadgeGlyph: Char = '\uE000'

    @Inject(
        method = ["updateRenderState(Lnet/minecraft/entity/PlayerLikeEntity;Lnet/minecraft/client/render/entity/state/PlayerEntityRenderState;F)V"],
        at = [At("TAIL")]
    )
    private fun bloomDecorateWorldNameWithIcon(
        entity: PlayerLikeEntity,
        state: PlayerEntityRenderState,
        tickDelta: Float,
        ci: CallbackInfo
    ) {
        val config = BadgeSystem.config()
        if (!config.enableBadges || !config.renderBadgesInWorld) {
            return
        }

        val baseName = state.playerName ?: return
        val badges = BadgeSystem.resolveBadges(
            com.mojang.authlib.GameProfile(entity.uuid, entity.name?.string ?: ""),
            BadgeRenderTarget.WORLD
        ).take(1)
        if (badges.isEmpty()) {
            return
        }
        state.playerName = buildBadgeName(baseName)
    }

    private fun buildBadgeName(baseName: Text): Text {
        val badgeStyle = Style.EMPTY.withFont(StyleSpriteSource.Font(worldBadgeFont))
        val badge = Text.literal(worldBadgeGlyph.toString()).setStyle(badgeStyle)
        return Text.empty().append(badge).append(" ").append(baseName.copy())
    }
}
