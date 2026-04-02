package dev.bloom.cosmetics.client.badges.data

import dev.bloom.cosmetics.client.badges.api.BadgeDefinition
import dev.bloom.cosmetics.client.badges.registry.BadgeRegistry
import net.minecraft.util.Identifier

object DefaultBadgeDefinitions {
    private fun tex(): Identifier = Identifier.of("bloomclient", "textures/gui/badges/bloom_logo.png")

    fun registerInto(registry: BadgeRegistry) {
        registry.register(
            BadgeDefinition(
                id = "staff",
                displayName = "Staff",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 90,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "verified",
                displayName = "Verified",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 80,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "creator",
                displayName = "Creator",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 70,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "beta_tester",
                displayName = "Beta Tester",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 60,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "developer",
                displayName = "Developer",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 95,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "founder",
                displayName = "Founder",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 100,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
        registry.register(
            BadgeDefinition(
                id = "premium",
                displayName = "Premium",
                texture = tex(),
                widthPx = 10,
                heightPx = 10,
                priority = 50,
                enabledByDefault = true,
                showInWorld = true,
                showInTab = true,
                showInChat = false,
                glyph = '\uE000'
            )
        )
    }
}
