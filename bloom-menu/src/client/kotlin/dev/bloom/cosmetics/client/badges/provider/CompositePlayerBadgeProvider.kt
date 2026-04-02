package dev.bloom.cosmetics.client.badges.provider

import java.util.UUID

class CompositePlayerBadgeProvider(
    private val providers: List<PlayerBadgeProvider>
) : PlayerBadgeProvider {
    override fun resolveBadgeIds(uuid: UUID, playerName: String): List<String> {
        if (providers.isEmpty()) return emptyList()
        return providers
            .asSequence()
            .flatMap { it.resolveBadgeIds(uuid, playerName).asSequence() }
            .map { it.lowercase() }
            .distinct()
            .toList()
    }

    override fun invalidate() {
        providers.forEach { it.invalidate() }
    }
}

