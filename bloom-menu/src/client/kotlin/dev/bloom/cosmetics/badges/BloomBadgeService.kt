package dev.bloom.cosmetics.badges

import dev.bloom.cosmetics.BloomCosmeticsRuntime
import dev.bloom.cosmetics.util.UuidUtil
import net.minecraft.text.Style
import net.minecraft.text.StyleSpriteSource
import net.minecraft.text.OrderedText
import net.minecraft.text.Text
import net.minecraft.util.Identifier
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

object BloomBadgeService {
    const val BADGE_CHAR: Char = '\uE000'
    const val PARTNER_BADGE_CHAR: Char = '\uE001'
    const val OWNER_BADGE_CHAR: Char = '\uE002'
    const val MANAGER_BADGE_CHAR: Char = '\uE003'
    const val PARTNER_RED_BADGE_CHAR: Char = '\uE004'
    const val PARTNER_RED_GLOW_BADGE_CHAR: Char = '\uE005'
    const val STAFF_GOLD_BADGE_CHAR: Char = '\uE006'
    const val STAFF_GOLD_GLOW_BADGE_CHAR: Char = '\uE007'
    const val OWNER_PINK_BADGE_CHAR: Char = '\uE008'
    const val OWNER_PINK_GLOW_BADGE_CHAR: Char = '\uE009'
    enum class Surface {
        NAMETAG,
        TAB_LIST,
        CHAT
    }

    private enum class LogoSide {
        LEFT,
        RIGHT
    }

    private val badgeFont = StyleSpriteSource.Font(Identifier.of("bloomcosmetics", "default"))
    private val nextLookupAtMs = ConcurrentHashMap<String, Long>()
    private val allBadgeChars = setOf(
        BADGE_CHAR,
        PARTNER_BADGE_CHAR,
        OWNER_BADGE_CHAR,
        MANAGER_BADGE_CHAR,
        PARTNER_RED_BADGE_CHAR,
        PARTNER_RED_GLOW_BADGE_CHAR,
        STAFF_GOLD_BADGE_CHAR,
        STAFF_GOLD_GLOW_BADGE_CHAR,
        OWNER_PINK_BADGE_CHAR,
        OWNER_PINK_GLOW_BADGE_CHAR
    )

    private fun badgeText(playerUuid: UUID, surface: Surface): Text? {
        val badgeChar = badgeCharFor(playerUuid) ?: return null
        val separator = when (surface) {
            Surface.CHAT -> " "
            Surface.NAMETAG, Surface.TAB_LIST -> ""
        }
        val badgeStyle = Style.EMPTY
            .withFont(badgeFont)
            .withColor(0xFFFFFF)
        return Text.empty()
            .append(Text.literal(separator))
            .append(Text.literal(badgeChar.toString()).setStyle(badgeStyle))
    }

    private fun logoSide(): LogoSide {
        return if (BloomCosmeticsRuntime.logoSide().equals("left", ignoreCase = true)) {
            LogoSide.LEFT
        } else {
            LogoSide.RIGHT
        }
    }

    fun decorateName(name: Text?, playerUuid: UUID?, surface: Surface): Text? {
        if (name == null) return null
        if (name.string.any { it in allBadgeChars }) return name
        if (!surfaceEnabled(surface)) return name
        if (playerUuid == null) return name
        if (!isBloomUser(playerUuid)) return name
        val badge = badgeText(playerUuid, surface) ?: return name
        return when (logoSide()) {
            LogoSide.LEFT -> Text.empty().append(badge.copy()).append(name.copy())
            LogoSide.RIGHT -> Text.empty().append(name.copy()).append(badge.copy())
        }
    }

    fun decorateChatLine(line: Text): Text {
        if (line.string.any { it in allBadgeChars }) return line
        if (!surfaceEnabled(Surface.CHAT)) return line
        val client = net.minecraft.client.MinecraftClient.getInstance() ?: return line
        val handler = client.networkHandler ?: return line
        val raw = line.string
        if (raw.isBlank()) return line

        for (entry in handler.playerList) {
            val profile = entry.profile ?: continue
            val uuid = profile.id ?: continue
            val username = profile.name ?: continue
            if (username.isBlank()) continue

            if (!isBloomUser(uuid)) {
                scheduleLookup(uuid)
                continue
            }

            if (raw.startsWith("<$username>") || raw.startsWith("$username:") || raw.startsWith("$username ")) {
                val badge = badgeText(uuid, Surface.CHAT) ?: return line
                return when (logoSide()) {
                    LogoSide.LEFT -> Text.empty().append(badge.copy()).append(line.copy())
                    LogoSide.RIGHT -> Text.empty().append(line.copy()).append(badge.copy())
                }
            }
        }
        return line
    }

    private fun scheduleLookup(playerUuid: UUID) {
        val normalized = UuidUtil.normalize(playerUuid.toString())
        if (normalized.isBlank()) return
        val now = System.currentTimeMillis()
        val next = nextLookupAtMs[normalized] ?: 0L
        if (now < next) return
        nextLookupAtMs[normalized] = now + 4000L
        BloomCosmeticsRuntime.requestBloomIdentity(normalized)
    }

    private fun isBloomUser(playerUuid: UUID): Boolean {
        val normalized = UuidUtil.normalize(playerUuid.toString())
        if (normalized.isBlank()) return false
        if (BloomCosmeticsRuntime.isBloomUser(normalized)) return true
        scheduleLookup(playerUuid)
        return false
    }

    private fun surfaceEnabled(surface: Surface): Boolean {
        return when (surface) {
            Surface.NAMETAG -> BloomCosmeticsRuntime.showNametagLogo()
            Surface.TAB_LIST -> BloomCosmeticsRuntime.showTabLogo()
            Surface.CHAT -> BloomCosmeticsRuntime.showChatLogo()
        }
    }

    private fun badgeCharFor(playerUuid: UUID): Char? {
        return when (BloomCosmeticsRuntime.badgeKeyFor(playerUuid.toString())?.lowercase()) {
            "none" -> null
            "partner" -> PARTNER_BADGE_CHAR
            "owner" -> OWNER_BADGE_CHAR
            "manager" -> MANAGER_BADGE_CHAR
            "partner-red" -> PARTNER_RED_BADGE_CHAR
            "partner-red-glow" -> PARTNER_RED_GLOW_BADGE_CHAR
            "staff-gold" -> STAFF_GOLD_BADGE_CHAR
            "staff-gold-glow" -> STAFF_GOLD_GLOW_BADGE_CHAR
            "owner-pink" -> OWNER_PINK_BADGE_CHAR
            "owner-pink-glow" -> OWNER_PINK_GLOW_BADGE_CHAR
            else -> BADGE_CHAR
        }
    }

}
