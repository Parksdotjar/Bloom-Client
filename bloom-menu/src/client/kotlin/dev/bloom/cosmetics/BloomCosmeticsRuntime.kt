package dev.bloom.cosmetics

import dev.bloom.cosmetics.auth.LauncherBridgeAuth
import dev.bloom.cosmetics.cache.TextureCacheManager
import dev.bloom.cosmetics.commands.FpsCommand
import dev.bloom.cosmetics.cosmetics.cape.CapeManager
import dev.bloom.cosmetics.cosmetics.cape.CapeStateService
import dev.bloom.cosmetics.presence.PlayerIdentityResolver
import dev.bloom.cosmetics.presence.RemoteCosmeticSyncService
import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents

object BloomCosmeticsRuntime {
    private val bridgeAuth = LauncherBridgeAuth.fromEnvironment()
    private val textureCacheManager = TextureCacheManager()
    private val capeStateService = CapeStateService(textureCacheManager)
    private val remoteSyncService = RemoteCosmeticSyncService(bridgeAuth, capeStateService)
    private val playerIdentityResolver = PlayerIdentityResolver(remoteSyncService, capeStateService)
    private val capeManager = CapeManager(capeStateService, playerIdentityResolver)

    fun initialize() {
        remoteSyncService.initialize()
        FpsCommand.register()

        ClientTickEvents.END_CLIENT_TICK.register { client ->
            remoteSyncService.tick(System.currentTimeMillis())
            capeManager.tick(client)
        }

        ClientLifecycleEvents.CLIENT_STOPPING.register {
            shutdown()
        }

        BloomLog.info("BLOOM COSMETICS runtime initialized. Bridge={}", bridgeAuth.baseHttpUrl)
    }

    fun shutdown() {
        remoteSyncService.shutdown()
        textureCacheManager.shutdown()
        BloomLog.info("BLOOM COSMETICS runtime stopped.")
    }

    fun capeTextureFor(uuidRaw: String) = capeManager.textureForPlayer(uuidRaw)
}
