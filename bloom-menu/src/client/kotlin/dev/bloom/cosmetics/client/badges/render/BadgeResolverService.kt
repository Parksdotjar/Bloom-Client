package dev.bloom.cosmetics.client.badges.render

import dev.bloom.cosmetics.client.badges.api.BadgeDefinition
import dev.bloom.cosmetics.client.badges.api.BadgeRenderTarget
import dev.bloom.cosmetics.client.badges.config.BadgeConfigStore
import dev.bloom.cosmetics.client.badges.provider.PlayerBadgeProvider
import dev.bloom.cosmetics.client.badges.registry.BadgeRegistry
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class BadgeResolverService(
    private val badgeRegistry: BadgeRegistry,
    private val provider: PlayerBadgeProvider,
    private val configStore: BadgeConfigStore
) {
    private val cache = ConcurrentHashMap<UUID, CachedBadgeResolution>()
    private val ttlMs = 2_500L

    fun resolveFor(uuid: UUID, playerName: String, target: BadgeRenderTarget): List<BadgeDefinition> {
        val config = configStore.current()
        if (!config.enableBadges) return emptyList()
        if (target == BadgeRenderTarget.WORLD && !config.renderBadgesInWorld) return emptyList()
        if (target == BadgeRenderTarget.TAB && !config.renderBadgesInTab) return emptyList()
        if (target == BadgeRenderTarget.CHAT && !config.renderBadgesInChat) return emptyList()

        val now = System.currentTimeMillis()
        val cached = cache[uuid]
        val resolved = if (cached != null && now - cached.updatedAtMs <= ttlMs) {
            cached.badges
        } else {
            val ids = provider.resolveBadgeIds(uuid, playerName)
            val badges = ids.asSequence()
                .mapNotNull { badgeRegistry.get(it) }
                .filter { it.isVisibleIn(target) }
                .sortedWith(compareByDescending<BadgeDefinition> { it.priority }.thenBy { it.id })
                .take(config.maxBadgesPerPlayer.coerceAtLeast(0))
                .toList()
            cache[uuid] = CachedBadgeResolution(now, badges)
            badges
        }

        return resolved
            .asSequence()
            .filter { it.isVisibleIn(target) }
            .take(config.maxBadgesPerPlayer.coerceAtLeast(0))
            .toList()
    }

    fun invalidate(uuid: UUID? = null) {
        if (uuid == null) {
            cache.clear()
            provider.invalidate()
        } else {
            cache.remove(uuid)
        }
    }

    private data class CachedBadgeResolution(
        val updatedAtMs: Long,
        val badges: List<BadgeDefinition>
    )
}

