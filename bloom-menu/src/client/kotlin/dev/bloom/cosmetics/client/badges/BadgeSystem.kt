package dev.bloom.cosmetics.client.badges

import com.mojang.authlib.GameProfile
import dev.bloom.cosmetics.client.badges.api.BadgeDefinition
import dev.bloom.cosmetics.client.badges.api.BadgeRenderTarget
import dev.bloom.cosmetics.client.badges.config.BadgeConfigStore
import dev.bloom.cosmetics.client.badges.data.DefaultBadgeDefinitions
import dev.bloom.cosmetics.client.badges.provider.CompositePlayerBadgeProvider
import dev.bloom.cosmetics.client.badges.provider.LocalDebugBadgeProvider
import dev.bloom.cosmetics.client.badges.provider.RemoteBadgeProviderScaffold
import dev.bloom.cosmetics.client.badges.registry.BadgeRegistry
import dev.bloom.cosmetics.client.badges.render.BadgeResolverService
import dev.bloom.cosmetics.client.badges.render.BadgeTextureManager
import dev.bloom.cosmetics.client.badges.util.BadgeDebugCommand
import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback
import net.minecraft.text.Text
import java.util.UUID

object BadgeSystem {
    private val registry = BadgeRegistry()
    private val configStore = BadgeConfigStore()
    private val localProvider = LocalDebugBadgeProvider(configStore)
    private val remoteProvider = RemoteBadgeProviderScaffold()
    private val provider = CompositePlayerBadgeProvider(listOf(remoteProvider, localProvider))
    private val resolver = BadgeResolverService(registry, provider, configStore)
    private val textureManager = BadgeTextureManager(registry)
    @Volatile
    private var initialized = false

    fun initialize() {
        if (initialized) return
        initialized = true
        configStore.load()
        DefaultBadgeDefinitions.registerInto(registry)
        textureManager.warmup()
        ClientCommandRegistrationCallback.EVENT.register(ClientCommandRegistrationCallback { dispatcher, _ ->
            BadgeDebugCommand.register(dispatcher, this)
        })
        BloomLog.info("Bloom badge system initialized with {} badge definitions.", registry.getAll().size)
    }

    fun listDefinitions(): List<BadgeDefinition> = registry.getAll()

    fun config() = configStore.current()

    fun resolveBadges(profile: GameProfile, target: BadgeRenderTarget): List<BadgeDefinition> {
        return resolver.resolveFor(profile.id, profile.name ?: "", target)
    }

    fun decorateName(baseName: Text, profile: GameProfile, target: BadgeRenderTarget): Text {
        // Texture badges are rendered directly in GUI/renderer hooks.
        // Keep name text unchanged so no glyph placeholders are inserted.
        return baseName
    }

    fun assignDebugBadges(uuid: UUID, badgeIds: List<String>) {
        localProvider.assign(uuid, badgeIds)
        resolver.invalidate(uuid)
    }

    fun clearDebugBadges(uuid: UUID) {
        localProvider.clear(uuid)
        resolver.invalidate(uuid)
    }

    fun refreshConfig() {
        configStore.load()
        resolver.invalidate()
    }

    fun setRemoteBadges(uuid: UUID, badgeIds: List<String>) {
        remoteProvider.upsertFromRemote(uuid, badgeIds)
        resolver.invalidate(uuid)
    }
}
