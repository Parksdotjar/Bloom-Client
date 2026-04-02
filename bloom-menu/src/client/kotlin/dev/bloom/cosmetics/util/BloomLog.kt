package dev.bloom.cosmetics.util

import org.slf4j.Logger
import org.slf4j.LoggerFactory

object BloomLog {
    val logger: Logger = LoggerFactory.getLogger("BloomCosmetics")

    fun info(message: String, vararg args: Any?) {
        logger.info(message, *args)
    }

    fun warn(message: String, vararg args: Any?) {
        logger.warn(message, *args)
    }

    fun debug(message: String, vararg args: Any?) {
        if (isDebugEnabled()) {
            logger.info("[debug] $message", *args)
        }
    }

    fun isDebugEnabled(): Boolean {
        return System.getProperty("bloom.cosmetics.debug", "false").equals("true", ignoreCase = true)
            || System.getenv("BLOOM_COSMETICS_DEBUG")?.equals("true", ignoreCase = true) == true
    }
}