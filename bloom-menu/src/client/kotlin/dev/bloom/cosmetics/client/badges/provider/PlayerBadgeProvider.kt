package dev.bloom.cosmetics.client.badges.provider

import java.util.UUID

interface PlayerBadgeProvider {
    fun resolveBadgeIds(uuid: UUID, playerName: String): List<String>
    fun invalidate() {}
}

