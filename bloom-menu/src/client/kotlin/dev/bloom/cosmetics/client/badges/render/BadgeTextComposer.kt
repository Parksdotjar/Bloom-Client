package dev.bloom.cosmetics.client.badges.render

import dev.bloom.cosmetics.client.badges.api.BadgeDefinition
import net.minecraft.text.MutableText
import net.minecraft.text.Style
import net.minecraft.text.Text
import net.minecraft.text.StyleSpriteSource
import net.minecraft.util.Identifier
import java.util.concurrent.ConcurrentHashMap

class BadgeTextComposer(
    private val badgeFontId: Identifier = Identifier.of("bloomcosmetics", "badges")
) {
    private val prefixCache = ConcurrentHashMap<String, Text>()

    fun withPrefix(baseName: Text, badges: List<BadgeDefinition>, spacing: Int): Text {
        if (badges.isEmpty()) return baseName
        val cacheKey = buildString {
            badges.forEach { append(it.id).append('|') }
            append(spacing)
        }
        val prefix = prefixCache.computeIfAbsent(cacheKey) {
            buildPrefixText(badges, spacing)
        }
        return Text.empty().append(prefix.copy()).append(baseName.copy())
    }

    fun invalidate() {
        prefixCache.clear()
    }

    private fun buildPrefixText(badges: List<BadgeDefinition>, spacing: Int): Text {
        val baseStyle = Style.EMPTY.withFont(StyleSpriteSource.Font(badgeFontId))
        val result: MutableText = Text.empty()
        badges.forEachIndexed { index, badge ->
            val glyphText = Text.literal(badge.glyph.toString()).setStyle(
                if (badge.tintColor != null) baseStyle.withColor(badge.tintColor) else baseStyle
            )
            result.append(glyphText)
            if (index != badges.lastIndex) {
                result.append(" ".repeat(spacing.coerceAtLeast(1)))
            }
        }
        result.append(" ")
        return result
    }
}

