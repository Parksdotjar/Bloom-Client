package dev.bloom.cosmetics.net

import dev.bloom.cosmetics.domain.EquippedCape

data class PresenceSnapshotPayload(
    val players: List<EquippedCape>
)

data class LiveCosmeticEvent(
    val type: String,
    val minecraftUuid: String? = null,
    val equippedCape: EquippedCape? = null,
    val snapshot: PresenceSnapshotPayload? = null,
    val reason: String? = null
)