package dev.bloom.cosmetics.util

import java.util.Locale

object UuidUtil {
    fun normalize(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val compact = raw.trim().lowercase(Locale.ROOT).replace("-", "")
        if (compact.length != 32) return ""
        for (ch in compact) {
            val ok = (ch in '0'..'9') || (ch in 'a'..'f')
            if (!ok) return ""
        }
        return compact
    }

    fun toDashed(normalized: String): String {
        if (normalized.length != 32) return normalized
        return buildString(36) {
            append(normalized, 0, 8)
            append('-')
            append(normalized, 8, 12)
            append('-')
            append(normalized, 12, 16)
            append('-')
            append(normalized, 16, 20)
            append('-')
            append(normalized, 20, 32)
        }
    }
}