package dev.bloom.cosmetics.cache

import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.loader.api.FabricLoader
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.security.MessageDigest

class AssetDiskCache {
    private val root: Path = FabricLoader.getInstance().gameDir
        .resolve(".bloomcosmetics")
        .resolve("cache")
        .resolve("capes")
    private val debugRoot: Path = FabricLoader.getInstance().gameDir
        .resolve(".bloomcosmetics")
        .resolve("debug")
        .resolve("capes")

    init {
        runCatching { Files.createDirectories(root) }
            .onFailure { BloomLog.warn("Failed to create cape disk cache directory: {}", it.toString()) }
        runCatching { Files.createDirectories(debugRoot) }
            .onFailure { BloomLog.warn("Failed to create cape debug directory: {}", it.toString()) }
    }

    fun pathFor(cacheKey: String): Path {
        val sha = sha1(cacheKey)
        return root.resolve("$sha.png")
    }

    fun read(cacheKey: String): ByteArray? {
        val path = pathFor(cacheKey)
        return if (Files.exists(path)) {
            runCatching { Files.readAllBytes(path) }
                .onFailure { BloomLog.warn("Failed reading disk cache {}: {}", path.fileName.toString(), it.toString()) }
                .getOrNull()
        } else {
            null
        }
    }

    fun write(cacheKey: String, bytes: ByteArray) {
        val path = pathFor(cacheKey)
        runCatching {
            Files.write(path, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)
        }.onFailure {
            BloomLog.warn("Failed writing disk cache {}: {}", path.fileName.toString(), it.toString())
        }
    }

    fun writeDebugDump(label: String, bytes: ByteArray) {
        val safeLabel = label.replace(Regex("[^a-zA-Z0-9._-]+"), "_").take(120)
        val path = debugRoot.resolve("$safeLabel.png")
        runCatching {
            Files.write(path, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)
        }.onFailure {
            BloomLog.warn("Failed writing cape debug dump {}: {}", path.fileName.toString(), it.toString())
        }
    }

    private fun sha1(value: String): String {
        val md = MessageDigest.getInstance("SHA-1")
        val bytes = md.digest(value.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
