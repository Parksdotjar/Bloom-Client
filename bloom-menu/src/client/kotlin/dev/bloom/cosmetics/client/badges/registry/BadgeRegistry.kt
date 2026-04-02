package dev.bloom.cosmetics.client.badges.registry

import dev.bloom.cosmetics.client.badges.api.BadgeDefinition
import java.util.concurrent.ConcurrentHashMap

class BadgeRegistry {
    private val definitions = ConcurrentHashMap<String, BadgeDefinition>()

    fun register(definition: BadgeDefinition) {
        definitions[definition.id.lowercase()] = definition
    }

    fun get(id: String): BadgeDefinition? = definitions[id.lowercase()]

    fun getAll(): List<BadgeDefinition> = definitions.values.sortedWith(
        compareByDescending<BadgeDefinition> { it.priority }.thenBy { it.id }
    )
}

