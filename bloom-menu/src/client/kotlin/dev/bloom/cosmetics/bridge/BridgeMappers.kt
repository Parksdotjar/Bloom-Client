package dev.bloom.cosmetics.bridge

import dev.bloom.cosmetics.domain.BloomSession
import dev.bloom.cosmetics.domain.CosmeticAsset
import dev.bloom.cosmetics.domain.CosmeticType
import dev.bloom.cosmetics.domain.EquippedCape
import dev.bloom.cosmetics.util.UuidUtil

fun BridgeSessionPayload.toDomain(token: String): BloomSession? {
    val uuid = UuidUtil.normalize(minecraftUuid)
    val userId = bloomUserId?.trim().orEmpty()
    if (!authenticated || uuid.isBlank() || userId.isBlank()) return null
    return BloomSession(
        bridgeToken = token,
        bloomUserId = userId,
        minecraftUuid = uuid,
        authenticated = true,
        backendApiBaseUrl = backendApiBaseUrl?.trim()?.ifBlank { null },
        backendWebSocketUrl = backendWsUrl?.trim()?.ifBlank { null },
        backendAccessToken = backendAccessToken?.trim()?.ifBlank { null },
        sessionId = sessionId?.trim()?.ifBlank { null }
    )
}

fun BridgeEquippedCapePayload.toDomain(defaultUuid: String? = null): EquippedCape? {
    val uuid = UuidUtil.normalize(minecraftUuid ?: defaultUuid)
    if (uuid.isBlank()) return null
    val capeAsset = cape?.toDomain() ?: return EquippedCape(
        minecraftUuid = uuid,
        asset = null,
        equippedAt = equippedAt
    )
    return EquippedCape(
        minecraftUuid = uuid,
        asset = capeAsset,
        equippedAt = equippedAt
    )
}

private fun BridgeCapeAssetPayload.toDomain(): CosmeticAsset? {
    val idValue = assetId?.trim().orEmpty()
    val texture = textureUrl?.trim().orEmpty()
    if (idValue.isBlank() || texture.isBlank()) return null
    return CosmeticAsset(
        id = idValue,
        type = CosmeticType.CAPE,
        textureUrl = texture,
        textureHash = textureHash?.trim()?.ifBlank { null },
        version = version ?: 0L,
        sourceType = sourceType?.trim()?.ifBlank { null },
        updatedAt = updatedAt?.trim()?.ifBlank { null }
    )
}