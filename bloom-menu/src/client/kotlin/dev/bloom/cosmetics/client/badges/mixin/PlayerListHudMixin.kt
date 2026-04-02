package dev.bloom.cosmetics.mixin.badges

import dev.bloom.cosmetics.client.badges.BadgeSystem
import dev.bloom.cosmetics.client.badges.api.BadgeRenderTarget
import dev.bloom.cosmetics.client.badges.render.TabBadgeIconRenderer
import net.minecraft.client.MinecraftClient
import net.minecraft.client.font.TextRenderer
import net.minecraft.client.gl.RenderPipelines
import net.minecraft.client.gui.DrawContext
import net.minecraft.client.gui.hud.PlayerListHud
import net.minecraft.client.network.PlayerListEntry
import net.minecraft.text.StringVisitable
import net.minecraft.text.Text
import net.minecraft.scoreboard.Scoreboard
import net.minecraft.scoreboard.ScoreboardObjective
import org.spongepowered.asm.mixin.Final
import org.spongepowered.asm.mixin.Mixin
import org.spongepowered.asm.mixin.Shadow
import org.spongepowered.asm.mixin.Unique
import org.spongepowered.asm.mixin.injection.At
import org.spongepowered.asm.mixin.injection.Inject
import org.spongepowered.asm.mixin.injection.Redirect
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo

@Mixin(PlayerListHud::class)
abstract class PlayerListHudMixin {
    @Unique
    private val badgeSize = 8

    @Unique
    private val badgeSpacing = 2

    @Shadow
    abstract fun getPlayerName(entry: PlayerListEntry): Text

    @Shadow
    @Final
    private lateinit var client: MinecraftClient

    @Unique
    private val bloomTabEntriesByName = HashMap<String, PlayerListEntry>()

    @Unique
    private val bloomIconRenderer = TabBadgeIconRenderer()

    @Unique
    private val bloomNamesWithBadge = HashSet<String>()

    @Inject(
        method = ["render(Lnet/minecraft/client/gui/DrawContext;ILnet/minecraft/scoreboard/Scoreboard;Lnet/minecraft/scoreboard/ScoreboardObjective;)V"],
        at = [At("HEAD")]
    )
    private fun bloomCaptureEntriesForBadges(
        context: DrawContext,
        scaledWindowWidth: Int,
        scoreboard: Scoreboard?,
        objective: ScoreboardObjective?,
        ci: CallbackInfo
    ) {
        bloomTabEntriesByName.clear()
        bloomNamesWithBadge.clear()
        val config = BadgeSystem.config()
        if (!config.enableBadges || !config.renderBadgesInTab) {
            return
        }

        val networkHandler = client.networkHandler ?: return
        for (entry in networkHandler.listedPlayerListEntries) {
            val key = getPlayerName(entry).string
            bloomTabEntriesByName.putIfAbsent(key, entry)
            val hasRenderable = BadgeSystem.resolveBadges(entry.profile, BadgeRenderTarget.TAB)
                .take(1)
                .any {
                    val info = bloomIconRenderer.textureInfo(it.texture)
                    info.available && info.width > 0 && info.height > 0
                }
            if (hasRenderable) {
                bloomNamesWithBadge.add(key)
            }
        }
    }

    @Redirect(
        method = ["render(Lnet/minecraft/client/gui/DrawContext;ILnet/minecraft/scoreboard/Scoreboard;Lnet/minecraft/scoreboard/ScoreboardObjective;)V"],
        at = At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/font/TextRenderer;getWidth(Lnet/minecraft/text/StringVisitable;)I"
        )
    )
    private fun bloomAdjustNameWidthForBadge(
        textRenderer: TextRenderer,
        text: StringVisitable
    ): Int {
        val baseWidth = textRenderer.getWidth(text)
        val asText = text as? Text ?: return baseWidth
        if (!bloomNamesWithBadge.contains(asText.string)) {
            return baseWidth
        }
        return baseWidth + badgeSize + badgeSpacing
    }

    @Redirect(
        method = ["render(Lnet/minecraft/client/gui/DrawContext;ILnet/minecraft/scoreboard/Scoreboard;Lnet/minecraft/scoreboard/ScoreboardObjective;)V"],
        at = At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/DrawContext;drawTextWithShadow(Lnet/minecraft/client/font/TextRenderer;Lnet/minecraft/text/Text;III)V"
        )
    )
    private fun bloomDrawTabNameBadge(
        context: DrawContext,
        textRenderer: TextRenderer,
        text: Text,
        x: Int,
        y: Int,
        color: Int
    ) {
        val config = BadgeSystem.config()
        if (!config.enableBadges || !config.renderBadgesInTab) {
            context.drawTextWithShadow(textRenderer, text, x, y, color)
            return
        }

        val entry = bloomTabEntriesByName[text.string]
            ?: run {
                context.drawTextWithShadow(textRenderer, text, x, y, color)
                return
            }

        val badges = BadgeSystem.resolveBadges(entry.profile, BadgeRenderTarget.TAB).take(1)
        if (badges.isEmpty()) {
            context.drawTextWithShadow(textRenderer, text, x, y, color)
            return
        }

        val renderable = badges.mapNotNull { badge ->
            val info = bloomIconRenderer.textureInfo(badge.texture)
            if (info.available && info.width > 0 && info.height > 0) {
                badge to info
            } else {
                null
            }
        }
        if (renderable.isEmpty()) {
            context.drawTextWithShadow(textRenderer, text, x, y, color)
            return
        }

        var drawX = x
        val drawY = y + ((9 - this.badgeSize) / 2).coerceAtLeast(0)
        for ((badge, info) in renderable) {
            context.drawTexture(
                RenderPipelines.GUI_TEXTURED,
                badge.texture,
                drawX,
                drawY,
                0f,
                0f,
                this.badgeSize,
                this.badgeSize,
                info.width,
                info.height,
                info.width,
                info.height
            )
            drawX += this.badgeSize + this.badgeSpacing
        }

        val totalOffset = renderable.size * this.badgeSize + renderable.size * this.badgeSpacing
        context.drawTextWithShadow(textRenderer, text, x + totalOffset, y, color)
    }
}
