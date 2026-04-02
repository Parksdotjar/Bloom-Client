package dev.bloom.cosmetics.client.badges.provider

import dev.bloom.cosmetics.util.BloomLog
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Backend-ready provider scaffold.
 *
 * Later Bloom backend integration should:
 * 1) fetch badge entitlements by minecraft UUID
 * 2) keep short TTL cache
 * 3) invalidate on world join/leave + realtime push updates
 */
class RemoteBadgeProviderScaffold : PlayerBadgeProvider {
    private val cached = ConcurrentHashMap<UUID, List<String>>()

    override fun resolveBadgeIds(uuid: UUID, playerName: String): List<String> {
        return cached[uuid].orEmpty()
    }

    fun upsertFromRemote(uuid: UUID, badgeIds: List<String>) {
        cached[uuid] = badgeIds.map { it.lowercase() }.distinct()
        BloomLog.debug("Remote badge cache updated uuid={} badges={}", uuid.toString(), badgeIds.joinToString(","))
    }

    fun clearRemote(uuid: UUID) {
        cached.remove(uuid)
    }

    override fun invalidate() {
        cached.clear()
    }
}

