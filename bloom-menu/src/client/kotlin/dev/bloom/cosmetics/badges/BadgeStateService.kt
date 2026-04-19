package dev.bloom.cosmetics.badges

import dev.bloom.cosmetics.bridge.BridgeEquippedCapePayload
import dev.bloom.cosmetics.util.UuidUtil
import java.util.concurrent.ConcurrentHashMap

class BadgeStateService {
    private val badgeKeyByUuid = ConcurrentHashMap<String, String>()

    fun upsert(payload: BridgeEquippedCapePayload?, defaultUuid: String? = null) {
        val uuid = UuidUtil.normalize(payload?.minecraftUuid ?: defaultUuid)
        if (uuid.isBlank()) return
        val rawBadge = payload?.badgeKey?.trim()?.lowercase().orEmpty()
        val resolved = when (rawBadge) {
            "none",
            "partner",
            "owner",
            "manager",
            "bloom",
            "partner-red",
            "partner-red-glow",
            "staff-gold",
            "staff-gold-glow",
            "owner-pink",
            "owner-pink-glow" -> rawBadge
            else -> "bloom"
        }
        badgeKeyByUuid[uuid] = resolved
    }

    fun clear(minecraftUuid: String) {
        val uuid = UuidUtil.normalize(minecraftUuid)
        if (uuid.isBlank()) return
        badgeKeyByUuid.remove(uuid)
    }

    fun badgeKeyFor(minecraftUuid: String): String? {
        val uuid = UuidUtil.normalize(minecraftUuid)
        if (uuid.isBlank()) return null
        return badgeKeyByUuid[uuid]
    }

    fun hasResolvedState(minecraftUuid: String): Boolean {
        val uuid = UuidUtil.normalize(minecraftUuid)
        if (uuid.isBlank()) return false
        return badgeKeyByUuid.containsKey(uuid)
    }
}
