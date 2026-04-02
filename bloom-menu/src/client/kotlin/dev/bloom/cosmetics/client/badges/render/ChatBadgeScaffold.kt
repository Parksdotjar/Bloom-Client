package dev.bloom.cosmetics.client.badges.render

import dev.bloom.cosmetics.util.BloomLog
import net.minecraft.text.Text

/**
 * Optional chat badge hook scaffold.
 *
 * Kept intentionally non-invasive for now. Future implementation path:
 * - parse sender profile from signed chat metadata
 * - resolve badges with BadgeRenderTarget.CHAT
 * - decorate sender segment before final chat line render
 */
object ChatBadgeScaffold {
    fun maybeDecorateIncoming(message: Text): Text {
        if (BloomLog.isDebugEnabled()) {
            BloomLog.debug("Chat badge scaffold observed message length={}", message.string.length)
        }
        return message
    }
}

