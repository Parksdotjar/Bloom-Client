package dev.bloom.cosmetics.domain

enum class CosmeticType {
    CAPE
}

data class CosmeticAsset(
    val id: String,
    val type: CosmeticType,
    val textureUrl: String,
    val textureHash: String? = null,
    val version: Long = 0L,
    val sourceType: String? = null,
    val updatedAt: String? = null
)

data class EquippedCape(
    val minecraftUuid: String,
    val asset: CosmeticAsset?,
    val equippedAt: String? = null
)

data class RemotePlayerCosmeticState(
    val minecraftUuid: String,
    val cape: EquippedCape?,
    val bloomUserId: String? = null,
    val bloomEnabled: Boolean,
    val lastUpdatedAtMs: Long
)