package dev.bloom.cosmetics.client.badges.provider

import dev.bloom.cosmetics.client.badges.config.BadgeConfigStore
import net.minecraft.client.MinecraftClient
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class LocalDebugBadgeProvider(
    private val configStore: BadgeConfigStore
) : PlayerBadgeProvider {
    private val runtimeAssignments = ConcurrentHashMap<UUID, List<String>>()

    override fun resolveBadgeIds(uuid: UUID, playerName: String): List<String> {
        val config = configStore.current()
        if (!config.debugBadgeAssignments) {
            return emptyList()
        }

        runtimeAssignments[uuid]?.let { return it }

        val byUuid = config.debugByUuid[uuid.toString()].orEmpty()
        if (byUuid.isNotEmpty()) return normalize(byUuid)

        val byName = config.debugByName[playerName.lowercase(Locale.ROOT)].orEmpty()
        if (byName.isNotEmpty()) return normalize(byName)

        // Dev convenience defaults so badge rendering can be verified immediately.
        val localPlayerUuid = MinecraftClient.getInstance().player?.uuid
        if (localPlayerUuid != null && localPlayerUuid == uuid) {
            return listOf("developer", "premium")
        }
        return emptyList()
    }

    fun assign(uuid: UUID, badgeIds: List<String>) {
        runtimeAssignments[uuid] = normalize(badgeIds)
    }

    fun clear(uuid: UUID) {
        runtimeAssignments.remove(uuid)
    }

    override fun invalidate() {
        runtimeAssignments.clear()
    }

    private fun normalize(badgeIds: List<String>): List<String> {
        return badgeIds
            .asSequence()
            .map { it.lowercase(Locale.ROOT).trim() }
            .filter { it.isNotBlank() }
            .distinct()
            .toList()
    }
}

