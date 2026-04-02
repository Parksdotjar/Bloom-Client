package dev.bloom.cosmetics.client.badges.api

import net.minecraft.util.Identifier

enum class BadgeRenderTarget {
    WORLD,
    TAB,
    CHAT
}

data class BadgeDefinition(
    val id: String,
    val displayName: String,
    val texture: Identifier,
    val widthPx: Int,
    val heightPx: Int,
    val priority: Int,
    val enabledByDefault: Boolean,
    val tintColor: Int? = null,
    val showInWorld: Boolean = true,
    val showInTab: Boolean = true,
    val showInChat: Boolean = false,
    val glyph: Char
) {
    fun isVisibleIn(target: BadgeRenderTarget): Boolean {
        return when (target) {
            BadgeRenderTarget.WORLD -> showInWorld
            BadgeRenderTarget.TAB -> showInTab
            BadgeRenderTarget.CHAT -> showInChat
        }
    }
}

