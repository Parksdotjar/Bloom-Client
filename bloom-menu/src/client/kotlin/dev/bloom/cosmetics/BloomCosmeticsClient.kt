package dev.bloom.cosmetics

import net.fabricmc.api.ClientModInitializer

class BloomCosmeticsClient : ClientModInitializer {
    override fun onInitializeClient() {
        BloomCosmeticsRuntime.initialize()
    }
}