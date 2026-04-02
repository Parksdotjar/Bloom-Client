package dev.bloom.cosmetics.client.badges.config

import com.google.gson.GsonBuilder
import com.google.gson.JsonSyntaxException
import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.loader.api.FabricLoader
import java.nio.file.Files
import java.nio.file.Path

class BadgeConfigStore(
    private val configPath: Path = FabricLoader.getInstance().configDir.resolve("bloomcosmetics_badges.json")
) {
    private val gson = GsonBuilder().setPrettyPrinting().create()

    @Volatile
    private var cached: BadgeConfig = BadgeConfig()

    fun load(): BadgeConfig {
        if (!Files.exists(configPath)) {
            save(cached)
            return cached
        }
        return runCatching {
            Files.newBufferedReader(configPath).use { reader ->
                gson.fromJson(reader, BadgeConfig::class.java) ?: BadgeConfig()
            }
        }.onFailure {
            when (it) {
                is JsonSyntaxException -> BloomLog.warn("Badge config malformed, using defaults path={}", configPath.toAbsolutePath().toString())
                else -> BloomLog.warn("Badge config load failed path={} reason={}", configPath.toAbsolutePath().toString(), it.toString())
            }
        }.getOrDefault(BadgeConfig()).also { loaded ->
            cached = loaded
        }
    }

    fun current(): BadgeConfig = cached

    fun save(config: BadgeConfig) {
        cached = config
        runCatching {
            Files.createDirectories(configPath.parent)
            Files.newBufferedWriter(configPath).use { writer ->
                gson.toJson(config, writer)
            }
        }.onFailure {
            BloomLog.warn("Badge config save failed path={} reason={}", configPath.toAbsolutePath().toString(), it.toString())
        }
    }

    fun update(mutator: (BadgeConfig) -> BadgeConfig): BadgeConfig {
        val next = mutator(cached)
        save(next)
        return next
    }
}

