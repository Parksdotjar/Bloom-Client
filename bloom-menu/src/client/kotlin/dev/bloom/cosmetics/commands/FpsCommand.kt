package dev.bloom.cosmetics.commands

import com.mojang.brigadier.arguments.StringArgumentType
import com.mojang.brigadier.context.CommandContext
import dev.bloom.cosmetics.util.BloomLog
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.literal
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager.argument
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource
import net.minecraft.client.MinecraftClient
import net.minecraft.client.option.CloudRenderMode
import net.minecraft.client.option.GameOptions
import net.minecraft.client.option.GraphicsMode
import net.minecraft.particle.ParticlesMode
import net.minecraft.client.render.ChunkBuilderMode
import net.minecraft.sound.SoundCategory
import net.minecraft.text.Text

object FpsCommand {
    private enum class Tier(
        val id: String,
        val summary: String,
        val viewDistance: Int,
        val simulationDistance: Int,
        val entityDistanceScale: Double,
        val maxFps: Int,
        val particles: ParticlesMode,
        val clouds: CloudRenderMode,
        val graphics: GraphicsMode,
        val mipmapLevels: Int,
        val biomeBlendRadius: Int,
        val ambientOcclusion: Boolean,
        val entityShadows: Boolean,
        val vsync: Boolean,
        val bobView: Boolean,
        val chunkBuilderMode: ChunkBuilderMode
    ) {
        QUALITY(
            id = "quality",
            summary = "Higher visuals with lighter optimization cuts.",
            viewDistance = 16,
            simulationDistance = 10,
            entityDistanceScale = 1.0,
            maxFps = 260,
            particles = ParticlesMode.ALL,
            clouds = CloudRenderMode.FANCY,
            graphics = GraphicsMode.FANCY,
            mipmapLevels = 4,
            biomeBlendRadius = 3,
            ambientOcclusion = true,
            entityShadows = true,
            vsync = false,
            bobView = true,
            chunkBuilderMode = ChunkBuilderMode.NEARBY
        ),
        BALANCED(
            id = "balanced",
            summary = "Good visuals without wasting too much frame time.",
            viewDistance = 12,
            simulationDistance = 8,
            entityDistanceScale = 0.85,
            maxFps = 260,
            particles = ParticlesMode.DECREASED,
            clouds = CloudRenderMode.FAST,
            graphics = GraphicsMode.FAST,
            mipmapLevels = 3,
            biomeBlendRadius = 2,
            ambientOcclusion = true,
            entityShadows = false,
            vsync = false,
            bobView = false,
            chunkBuilderMode = ChunkBuilderMode.PLAYER_AFFECTED
        ),
        PERFORMANCE(
            id = "performance",
            summary = "Aggressive FPS preset for general PvP and busy servers.",
            viewDistance = 8,
            simulationDistance = 6,
            entityDistanceScale = 0.75,
            maxFps = 260,
            particles = ParticlesMode.MINIMAL,
            clouds = CloudRenderMode.OFF,
            graphics = GraphicsMode.FAST,
            mipmapLevels = 2,
            biomeBlendRadius = 1,
            ambientOcclusion = false,
            entityShadows = false,
            vsync = false,
            bobView = false,
            chunkBuilderMode = ChunkBuilderMode.NONE
        ),
        TURBO(
            id = "turbo",
            summary = "Tighter distances and reduced effects for stronger FPS gains.",
            viewDistance = 6,
            simulationDistance = 5,
            entityDistanceScale = 0.6,
            maxFps = 260,
            particles = ParticlesMode.MINIMAL,
            clouds = CloudRenderMode.OFF,
            graphics = GraphicsMode.FAST,
            mipmapLevels = 1,
            biomeBlendRadius = 0,
            ambientOcclusion = false,
            entityShadows = false,
            vsync = false,
            bobView = false,
            chunkBuilderMode = ChunkBuilderMode.NONE
        ),
        OVERDRIVE(
            id = "overdrive",
            summary = "Maximum in-game FPS bias. Lowest safe visuals and shortest practical distances.",
            viewDistance = 4,
            simulationDistance = 4,
            entityDistanceScale = 0.5,
            maxFps = 260,
            particles = ParticlesMode.MINIMAL,
            clouds = CloudRenderMode.OFF,
            graphics = GraphicsMode.FAST,
            mipmapLevels = 0,
            biomeBlendRadius = 0,
            ambientOcclusion = false,
            entityShadows = false,
            vsync = false,
            bobView = false,
            chunkBuilderMode = ChunkBuilderMode.NONE
        ),
        OVERDRIVE_PLUS(
            id = "overdrive+",
            summary = "Nuclear preset: extreme visuals cut + non-essential audio muted.",
            viewDistance = 2,
            simulationDistance = 2,
            entityDistanceScale = 0.35,
            maxFps = 260,
            particles = ParticlesMode.MINIMAL,
            clouds = CloudRenderMode.OFF,
            graphics = GraphicsMode.FAST,
            mipmapLevels = 0,
            biomeBlendRadius = 0,
            ambientOcclusion = false,
            entityShadows = false,
            vsync = false,
            bobView = false,
            chunkBuilderMode = ChunkBuilderMode.NONE
        );

        companion object {
            fun from(raw: String): Tier? = entries.firstOrNull { it.id.equals(raw, ignoreCase = true) }
        }
    }

    fun register() {
        ClientCommandRegistrationCallback.EVENT.register { dispatcher, _ ->
            dispatcher.register(
                literal("fps")
                    .executes(::showUsage)
                    .then(
                        argument("tier", StringArgumentType.word())
                            .suggests { _, builder ->
                                Tier.entries.forEach { builder.suggest(it.id) }
                                builder.buildFuture()
                            }
                            .executes { context ->
                                val tierId = StringArgumentType.getString(context, "tier")
                                val tier = Tier.from(tierId)
                                if (tier == null) {
                                    sendMessage(context.source.client, "Unknown tier \"$tierId\". Use: ${Tier.entries.joinToString(", ") { it.id }}")
                                    return@executes 0
                                }
                                applyPreset(context.source.client, tier)
                                1
                            }
                    )
            )
        }
    }

    private fun showUsage(context: CommandContext<FabricClientCommandSource>): Int {
        val tiers = Tier.entries.joinToString(" | ") { "${it.id}: ${it.summary}" }
        sendMessage(context.source.client, "Usage: /fps <tier>")
        sendMessage(context.source.client, tiers)
        return 1
    }

    private fun applyPreset(client: MinecraftClient, tier: Tier) {
        val options = client.options
        options.applyGraphicsMode(tier.graphics)
        options.getCloudRenderMode().setValue(tier.clouds)
        options.getParticles().setValue(tier.particles)
        options.getViewDistance().setValue(tier.viewDistance)
        options.getSimulationDistance().setValue(tier.simulationDistance)
        options.getEntityDistanceScaling().setValue(tier.entityDistanceScale)
        options.getMaxFps().setValue(tier.maxFps)
        options.getMipmapLevels().setValue(tier.mipmapLevels)
        options.getBiomeBlendRadius().setValue(tier.biomeBlendRadius)
        options.getAo().setValue(tier.ambientOcclusion)
        options.getEntityShadows().setValue(tier.entityShadows)
        options.getEnableVsync().setValue(tier.vsync)
        options.getBobView().setValue(tier.bobView)
        options.getChunkBuilderMode().setValue(tier.chunkBuilderMode)

        if (tier == Tier.OVERDRIVE || tier == Tier.OVERDRIVE_PLUS) {
            applyOverdriveExtras(options)
        }
        if (tier == Tier.OVERDRIVE_PLUS) {
            applyOverdrivePlusAudio(options)
        }

        options.write()
        options.sendClientSettings()

        BloomLog.info("Applied /fps preset {}", tier.id)
        sendMessage(
            client,
            "Applied /fps ${tier.id}: view ${tier.viewDistance}, sim ${tier.simulationDistance}, particles ${tier.particles.name.lowercase()}, clouds ${tier.clouds.name.lowercase()}."
        )
    }

    private fun applyOverdriveExtras(options: GameOptions) {
        // Extra aggressive pass: push additional visual/FX settings down for max FPS bias.
        options.getCloudRenderDistance().setValue(4)
        options.getWeatherRadius().setValue(0)
        options.getCutoutLeaves().setValue(false)
        options.getVignette().setValue(false)
        options.getImprovedTransparency().setValue(false)
        options.getChunkFade().setValue(0.0)
        options.getMenuBackgroundBlurriness().setValue(0)
        options.getPanoramaSpeed().setValue(0.0)
        options.getMaxAnisotropy().setValue(1)
        options.getDistortionEffectScale().setValue(0.0)
        options.getFovEffectScale().setValue(0.0)
        options.getDarknessEffectScale().setValue(0.0)
        options.getGlintSpeed().setValue(0.0)
        options.getGlintStrength().setValue(0.0)
        options.getDamageTiltStrength().setValue(0.0)
        options.getShowSubtitles().setValue(false)
        options.getDirectionalAudio().setValue(false)
        options.getShowAutosaveIndicator().setValue(false)
        options.getHideLightningFlashes().setValue(true)
        options.getHideSplashTexts().setValue(true)
        options.getMonochromeLogo().setValue(true)
    }

    private fun applyOverdrivePlusAudio(options: GameOptions) {
        options.getSoundVolumeOption(SoundCategory.MUSIC).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.WEATHER).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.BLOCKS).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.HOSTILE).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.NEUTRAL).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.PLAYERS).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.AMBIENT).setValue(0.0)
        options.getSoundVolumeOption(SoundCategory.VOICE).setValue(0.0)
    }

    private fun sendMessage(client: MinecraftClient, message: String) {
        val text = Text.literal("[Bloom] $message")
        client.player?.sendMessage(text, false) ?: client.inGameHud.chatHud.addMessage(text)
    }
}
