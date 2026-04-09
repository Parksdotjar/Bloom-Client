package dev.bloom.cosmetics.cache

import net.minecraft.util.Identifier
import java.util.concurrent.ConcurrentHashMap

class MemoryTextureRegistry {
    private val byKey = ConcurrentHashMap<String, Identifier>()

    fun get(cacheKey: String): Identifier? = byKey[cacheKey]

    fun put(cacheKey: String, identifier: Identifier) {
        byKey[cacheKey] = identifier
    }

    fun remove(cacheKey: String) {
        byKey.remove(cacheKey)
    }

    fun contains(cacheKey: String): Boolean = byKey.containsKey(cacheKey)
}