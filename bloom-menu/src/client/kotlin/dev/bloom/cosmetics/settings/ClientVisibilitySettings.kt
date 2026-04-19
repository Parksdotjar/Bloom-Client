package dev.bloom.cosmetics.settings

import dev.bloom.cosmetics.auth.LauncherBridgeAuth
import dev.bloom.cosmetics.bridge.LauncherBridgeClient
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

class ClientVisibilitySettings(auth: LauncherBridgeAuth) {
    private val bridgeClient = LauncherBridgeClient(auth)
    private val nextRefreshAt = AtomicLong(0L)
    private val refreshInFlight = AtomicBoolean(false)
    private val showNametag = AtomicBoolean(true)
    private val showTab = AtomicBoolean(true)
    private val showChat = AtomicBoolean(true)
    private val logoSide = AtomicReference("right")

    fun tick(now: Long) {
        if (now < nextRefreshAt.get()) return
        if (!refreshInFlight.compareAndSet(false, true)) return
        nextRefreshAt.set(now + 1000L)
        bridgeClient.fetchClientPreferences()
            .whenComplete { payload, _ ->
                if (payload != null) {
                    showNametag.set(payload.showBloomNametagLogo)
                    showTab.set(payload.showBloomTabLogo)
                    showChat.set(payload.showBloomChatLogo)
                    logoSide.set(if (payload.bloomLogoSide.equals("left", ignoreCase = true)) "left" else "right")
                }
                refreshInFlight.set(false)
            }
    }

    fun showNametagLogo(): Boolean = showNametag.get()

    fun showTabLogo(): Boolean = showTab.get()

    fun showChatLogo(): Boolean = showChat.get()

    fun logoSide(): String = logoSide.get()
}
