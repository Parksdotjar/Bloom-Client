package dev.bloom.cosmetics.client.badges.config

data class BadgeConfig(
    val enableBadges: Boolean = true,
    val renderBadgesInWorld: Boolean = true,
    val renderBadgesInTab: Boolean = true,
    val renderBadgesInChat: Boolean = false,
    val maxBadgesPerPlayer: Int = 3,
    val badgeScale: Float = 1.0f,
    val badgeSpacing: Int = 1,
    val debugBadgeAssignments: Boolean = true,
    val debugByUuid: Map<String, List<String>> = emptyMap(),
    val debugByName: Map<String, List<String>> = emptyMap()
)

