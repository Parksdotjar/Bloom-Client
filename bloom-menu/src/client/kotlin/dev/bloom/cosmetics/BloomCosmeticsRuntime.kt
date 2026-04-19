package dev.bloom.cosmetics

import dev.bloom.cosmetics.auth.LauncherBridgeAuth
import dev.bloom.cosmetics.badges.BadgeStateService
import dev.bloom.cosmetics.cache.TextureCacheManager
import dev.bloom.cosmetics.commands.FpsCommand
import dev.bloom.cosmetics.cosmetics.cape.CapeManager
import dev.bloom.cosmetics.cosmetics.cape.CapeStateService
import dev.bloom.cosmetics.presence.PlayerIdentityResolver
import dev.bloom.cosmetics.presence.RemoteCosmeticSyncService
import dev.bloom.cosmetics.settings.ClientVisibilitySettings
import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents

object BloomCosmeticsRuntime {
    private val bridgeAuth = LauncherBridgeAuth.fromEnvironment()
    private val textureCacheManager = TextureCacheManager()
    private val capeStateService = CapeStateService(textureCacheManager)
    private val badgeStateService = BadgeStateService()
    private val remoteSyncService = RemoteCosmeticSyncService(bridgeAuth, capeStateService, badgeStateService)
    private val playerIdentityResolver = PlayerIdentityResolver(remoteSyncService, capeStateService)
    private val capeManager = CapeManager(capeStateService, playerIdentityResolver)
    private val visibilitySettings = ClientVisibilitySettings(bridgeAuth)

    fun initialize() {
        remoteSyncService.initialize()
        FpsCommand.register()

        ClientTickEvents.END_CLIENT_TICK.register { client ->
            val now = System.currentTimeMillis()
            remoteSyncService.tick(now)
            capeManager.tick(client)
            visibilitySettings.tick(now)
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

    fun isBloomUser(uuidRaw: String): Boolean = badgeStateService.hasResolvedState(uuidRaw) || capeStateService.hasResolvedState(uuidRaw)

    fun badgeKeyFor(uuidRaw: String): String? = badgeStateService.badgeKeyFor(uuidRaw)

    fun requestBloomIdentity(uuidRaw: String) {
        remoteSyncService.resolveCapeForPlayer(uuidRaw)
    }

    fun showNametagLogo(): Boolean = visibilitySettings.showNametagLogo()

    fun showTabLogo(): Boolean = visibilitySettings.showTabLogo()

    fun showChatLogo(): Boolean = visibilitySettings.showChatLogo()

    fun logoSide(): String = visibilitySettings.logoSide()

}
