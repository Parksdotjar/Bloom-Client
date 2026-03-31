package dev.bloom.cosmetics.presence

import dev.bloom.cosmetics.auth.LauncherBridgeAuth
import dev.bloom.cosmetics.bridge.BridgeLiveEventPayload
import dev.bloom.cosmetics.bridge.LauncherBridgeClient
import dev.bloom.cosmetics.bridge.toDomain
import dev.bloom.cosmetics.cosmetics.cape.CapeStateService
import dev.bloom.cosmetics.domain.BloomSession
import dev.bloom.cosmetics.net.BloomApiClient
import dev.bloom.cosmetics.net.BloomWebSocketClient
import dev.bloom.cosmetics.net.SupabasePublicCapeClient
import dev.bloom.cosmetics.net.SupabasePublicAuth
import dev.bloom.cosmetics.util.BloomLog
import dev.bloom.cosmetics.util.UuidUtil
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap

class RemoteCosmeticSyncService(
    private val auth: LauncherBridgeAuth,
    private val capeStateService: CapeStateService
) {
    private val bridgeClient = LauncherBridgeClient(auth)
    private val fallbackClient = SupabasePublicCapeClient(SupabasePublicAuth.fromEnvironment())
    private val bridgeEnabled: Boolean = auth.token.isNotBlank()

    @Volatile
    private var session: BloomSession? = null

    @Volatile
    private var backendApiClient: BloomApiClient? = null

    @Volatile
    private var backendWsClient: BloomWebSocketClient? = null

    @Volatile
    private var nextReconnectAtMs: Long = 0L

    private val inFlightResolve: ConcurrentMap<String, Boolean> = ConcurrentHashMap()

    fun initialize() {
        if (!bridgeEnabled) {
            BloomLog.warn("BLOOM COSMETICS bridge token missing. Using Supabase public fallback mode.")
        } else {
            bootstrapSession()
        }
    }

    fun shutdown() {
        bridgeClient.closeLive()
        backendWsClient?.close()
        backendWsClient = null
    }

    fun tick(nowMs: Long) {
        if (!bridgeEnabled) return
        if (session != null) return
        if (nowMs >= nextReconnectAtMs) {
            bootstrapSession()
        }
    }

    fun resolveCapeForPlayer(minecraftUuid: String): CompletableFuture<Boolean> {
        val normalized = UuidUtil.normalize(minecraftUuid)
        if (normalized.isBlank()) return CompletableFuture.completedFuture(false)
        if (inFlightResolve.putIfAbsent(normalized, true) != null) {
            return CompletableFuture.completedFuture(false)
        }

        val resolver = backendApiClient
        val primaryFuture = when {
            resolver != null -> resolver.fetchEquippedCapeByMinecraftUuid(normalized)
            bridgeEnabled -> bridgeClient.fetchPlayerCape(UuidUtil.toDashed(normalized))
            else -> CompletableFuture.completedFuture(null)
        }
        val mergedFuture = primaryFuture.thenCompose { primary ->
            if (primary != null) {
                CompletableFuture.completedFuture(primary)
            } else {
                fallbackClient.fetchEquippedCapeByMinecraftUuid(normalized)
            }
        }

        return mergedFuture.thenApply { payload ->
            val equipped = payload?.toDomain(defaultUuid = normalized)
            if (equipped != null) {
                capeStateService.upsert(equipped)
                true
            } else {
                capeStateService.clear(normalized)
                false
            }
        }.exceptionally {
            BloomLog.debug("Resolve player cape failed uuid={} reason={}", normalized, it.toString())
            false
        }.whenComplete { _, _ ->
            inFlightResolve.remove(normalized)
        }
    }

    private fun bootstrapSession() {
        if (!bridgeEnabled) {
            return
        }
        bridgeClient.fetchSession().thenAccept { payload ->
            val resolved = payload?.toDomain(auth.token)
            if (resolved == null) {
                session = null
                scheduleReconnect(5000)
                return@thenAccept
            }
            session = resolved
            backendApiClient = createApiClient(resolved)
            connectBridgeLive()
            connectBackendLive(resolved)
            bridgeClient.fetchLocalEquippedCape().thenAccept { equippedPayload ->
                val equipped = equippedPayload?.toDomain(defaultUuid = resolved.minecraftUuid)
                if (equipped != null) {
                    capeStateService.upsert(equipped)
                    BloomLog.info("Local cape loaded for uuid={}", resolved.minecraftUuid)
                }
            }
            BloomLog.info("Bloom session connected user={} uuid={}", resolved.bloomUserId, resolved.minecraftUuid)
        }.exceptionally {
            BloomLog.warn("Bridge session bootstrap failed: {}", it.toString())
            session = null
            scheduleReconnect(5000)
            null
        }
    }

    private fun connectBridgeLive() {
        if (!bridgeEnabled) {
            return
        }
        bridgeClient.openLive(
            onEvent = { event -> handleLiveEvent(event) },
            onDisconnect = { reason ->
                BloomLog.warn("Launcher bridge live disconnected: {}", reason)
                scheduleReconnect(3000)
                session = null
            }
        )
    }

    private fun connectBackendLive(activeSession: BloomSession) {
        val wsUrl = activeSession.backendWebSocketUrl?.trim().orEmpty()
        val accessToken = activeSession.backendAccessToken?.trim().orEmpty()
        if (wsUrl.isBlank() || accessToken.isBlank()) {
            return
        }
        val wsClient = BloomWebSocketClient(wsUrl, accessToken)
        backendWsClient = wsClient
        wsClient.connect(
            onEvent = { event -> handleLiveEvent(event) },
            onDisconnect = { reason ->
                BloomLog.warn("Backend live disconnected: {}", reason)
            }
        )
    }

    private fun handleLiveEvent(event: BridgeLiveEventPayload) {
        when (event.type?.lowercase()) {
            "equipped_changed", "player_cape_changed", "cape_updated", "local_equipped_changed" -> {
                val equipped = event.equipped?.toDomain(defaultUuid = event.minecraftUuid)
                if (equipped != null) {
                    capeStateService.upsert(equipped)
                } else {
                    val uuid = UuidUtil.normalize(event.minecraftUuid)
                    if (uuid.isNotBlank()) {
                        capeStateService.clear(uuid)
                    }
                }
            }

            "presence_snapshot", "snapshot" -> {
                event.players.orEmpty().forEach { payload ->
                    payload.toDomain(defaultUuid = payload.minecraftUuid)?.let { capeStateService.upsert(it) }
                }
            }

            "logout", "session_revoked", "account_switched" -> {
                session = null
                scheduleReconnect(1500)
            }
        }
    }

    private fun createApiClient(session: BloomSession): BloomApiClient? {
        val base = session.backendApiBaseUrl?.trim().orEmpty()
        val token = session.backendAccessToken?.trim().orEmpty()
        if (base.isBlank() || token.isBlank()) return null
        return BloomApiClient(base, token)
    }

    private fun scheduleReconnect(delayMs: Long) {
        nextReconnectAtMs = System.currentTimeMillis() + delayMs
    }
}
