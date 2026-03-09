package com.bloomunit.bloommenu.client;

import com.bloomunit.bloommenu.BloomMenuMod;
import com.bloomunit.bloommenu.client.config.BloomConfig;
import com.bloomunit.bloommenu.client.config.BloomConfigManager;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.CloudRenderMode;
import net.minecraft.client.option.GameOptions;
import net.minecraft.client.option.GraphicsMode;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.client.render.ChunkBuilderMode;
import net.minecraft.particle.ParticlesMode;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;

public final class BloomFeatureController {
    private static final KeyBinding.Category FEATURES_CATEGORY = KeyBinding.Category.create(Identifier.of(BloomMenuMod.MOD_ID, "features"));
    private static KeyBinding zoomKey;
    private static KeyBinding sprintToggleKey;
    private static KeyBinding sneakToggleKey;

    private static boolean sprintToggled;
    private static boolean sneakToggled;
    private static boolean fpsBoosterApplied;
    private static String fpsBoosterProfileApplied = "";
    private static FpsOptionSnapshot fpsSnapshot;

    private static double baseFov = -1.0;
    private static double currentFov = -1.0;

    private BloomFeatureController() {
    }

    public static void registerKeybindings() {
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key." + BloomMenuMod.MOD_ID + ".zoom",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_C,
            FEATURES_CATEGORY
        ));
        sprintToggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key." + BloomMenuMod.MOD_ID + ".toggle_sprint",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_V,
            FEATURES_CATEGORY
        ));
        sneakToggleKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key." + BloomMenuMod.MOD_ID + ".toggle_sneak",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_B,
            FEATURES_CATEGORY
        ));
    }

    public static void tick(MinecraftClient client) {
        if (client == null || client.options == null) {
            return;
        }

        BloomConfig config = BloomConfigManager.get();
        handleFpsBooster(client, config);
        handleZoom(client, config);
        handleSprintSneak(client, config);
    }

    private static void handleFpsBooster(MinecraftClient client, BloomConfig config) {
        GameOptions options = client.options;
        if (!config.fpsBooster) {
            if (fpsBoosterApplied && fpsSnapshot != null) {
                fpsSnapshot.restore(options);
                options.write();
            }
            fpsBoosterApplied = false;
            fpsBoosterProfileApplied = "";
            fpsSnapshot = null;
            return;
        }

        boolean profileChanged = !config.fpsBoosterProfile.equals(fpsBoosterProfileApplied);
        if (!fpsBoosterApplied) {
            fpsSnapshot = FpsOptionSnapshot.capture(options);
        }

        if (!fpsBoosterApplied || profileChanged) {
            applyFpsBooster(options, config.fpsBoosterProfile);
            options.write();
            fpsBoosterApplied = true;
            fpsBoosterProfileApplied = config.fpsBoosterProfile;
        }
    }

    private static void applyFpsBooster(GameOptions options, String profile) {
        String activeProfile = profile == null ? "aggressive" : profile;
        boolean balanced = "balanced".equals(activeProfile);
        boolean extreme = "extreme".equals(activeProfile);

        int viewDistance = balanced ? 10 : extreme ? 6 : 8;
        int simulationDistance = balanced ? 8 : 5;
        double entityDistanceScaling = balanced ? 0.75 : extreme ? 0.5 : 0.6;
        int cloudDistance = balanced ? 8 : 4;
        int weatherRadius = balanced ? 1 : 0;
        ParticlesMode particlesMode = balanced ? ParticlesMode.DECREASED : ParticlesMode.MINIMAL;
        int mipmaps = balanced ? 2 : 0;
        int anisotropy = balanced ? 2 : 1;
        ChunkBuilderMode chunkBuilderMode = balanced ? ChunkBuilderMode.NEARBY : ChunkBuilderMode.NONE;

        options.applyGraphicsMode(GraphicsMode.FAST);
        options.getEnableVsync().setValue(false);
        options.getMaxFps().setValue(GameOptions.MAX_FPS_LIMIT);

        options.getViewDistance().setValue(viewDistance);
        options.getSimulationDistance().setValue(simulationDistance);
        options.getEntityDistanceScaling().setValue(entityDistanceScaling);
        options.getCloudRenderMode().setValue(CloudRenderMode.OFF);
        options.getCloudRenderDistance().setValue(cloudDistance);
        options.getWeatherRadius().setValue(weatherRadius);
        options.getParticles().setValue(particlesMode);
        options.getBiomeBlendRadius().setValue(0);
        options.getMipmapLevels().setValue(mipmaps);
        options.getMaxAnisotropy().setValue(anisotropy);

        options.getCutoutLeaves().setValue(true);
        options.getAo().setValue(false);
        options.getImprovedTransparency().setValue(false);
        options.getEntityShadows().setValue(false);
        options.getVignette().setValue(false);
        options.getChunkFade().setValue(0.0);
        options.getChunkBuilderMode().setValue(chunkBuilderMode);

        options.getDistortionEffectScale().setValue(0.0);
        options.getFovEffectScale().setValue(0.0);
        options.getDarknessEffectScale().setValue(0.0);
        options.getGlintSpeed().setValue(balanced ? 0.5 : 0.0);
        options.getGlintStrength().setValue(balanced ? 0.5 : 0.0);
        options.getDamageTiltStrength().setValue(0.0);
        options.getMenuBackgroundBlurriness().setValue(0);
    }

    private static void handleZoom(MinecraftClient client, BloomConfig config) {
        var fovOption = client.options.getFov();
        if (!config.zoomEnabled || zoomKey == null) {
            restoreFov(fovOption);
            return;
        }

        double currentSetting = fovOption.getValue();
        if (baseFov < 0.0) {
            baseFov = currentSetting;
        }
        if (currentFov < 0.0) {
            currentFov = currentSetting;
        }

        boolean zoomHeld = zoomKey.isPressed();
        if (!zoomHeld && Math.abs(currentSetting - baseFov) < 0.5) {
            baseFov = currentSetting;
        }

        double zoomFactor = switch (config.zoomStrength) {
            case "2x" -> 2.0;
            case "4x" -> 4.0;
            case "5x" -> 5.0;
            default -> 3.0;
        };
        double target = zoomHeld ? Math.max(30.0, baseFov / zoomFactor) : baseFov;
        currentFov += (target - currentFov) * 0.28;
        int next = (int) Math.round(currentFov);
        if (Math.abs(fovOption.getValue() - next) >= 1) {
            fovOption.setValue(next);
        }
        if (!zoomHeld && Math.abs(currentFov - baseFov) < 0.3) {
            restoreFov(fovOption);
        }
    }

    private static void restoreFov(net.minecraft.client.option.SimpleOption<Integer> fovOption) {
        if (baseFov > 0.0) {
            int restore = (int) Math.round(baseFov);
            if (fovOption.getValue() != restore) {
                fovOption.setValue(restore);
            }
            currentFov = baseFov;
        } else {
            baseFov = fovOption.getValue();
            currentFov = baseFov;
        }
    }

    private static void handleSprintSneak(MinecraftClient client, BloomConfig config) {
        if (sprintToggleKey == null || sneakToggleKey == null) {
            return;
        }
        if (!config.toggleSprintSneak) {
            sprintToggled = false;
            sneakToggled = false;
            client.options.sprintKey.setPressed(false);
            client.options.sneakKey.setPressed(false);
            return;
        }

        while (sprintToggleKey.wasPressed()) {
            sprintToggled = !sprintToggled;
        }
        while (sneakToggleKey.wasPressed()) {
            sneakToggled = !sneakToggled;
        }

        client.options.sprintKey.setPressed(sprintToggled);
        client.options.sneakKey.setPressed(sneakToggled);
        if (client.player != null && sprintToggled && client.player.forwardSpeed > 0.0F) {
            client.player.setSprinting(true);
        }
    }

    private record FpsOptionSnapshot(
        GraphicsMode graphicsMode,
        boolean enableVsync,
        int maxFps,
        int viewDistance,
        int simulationDistance,
        double entityDistanceScaling,
        CloudRenderMode cloudRenderMode,
        int cloudRenderDistance,
        int weatherRadius,
        ParticlesMode particlesMode,
        int biomeBlendRadius,
        int mipmapLevels,
        int maxAnisotropy,
        boolean cutoutLeaves,
        boolean ao,
        boolean improvedTransparency,
        boolean entityShadows,
        boolean vignette,
        double chunkFade,
        ChunkBuilderMode chunkBuilderMode,
        double distortionEffectScale,
        double fovEffectScale,
        double darknessEffectScale,
        double glintSpeed,
        double glintStrength,
        double damageTiltStrength,
        int menuBackgroundBlurriness
    ) {
        private static FpsOptionSnapshot capture(GameOptions options) {
            return new FpsOptionSnapshot(
                options.getPreset().getValue(),
                options.getEnableVsync().getValue(),
                options.getMaxFps().getValue(),
                options.getViewDistance().getValue(),
                options.getSimulationDistance().getValue(),
                options.getEntityDistanceScaling().getValue(),
                options.getCloudRenderMode().getValue(),
                options.getCloudRenderDistance().getValue(),
                options.getWeatherRadius().getValue(),
                options.getParticles().getValue(),
                options.getBiomeBlendRadius().getValue(),
                options.getMipmapLevels().getValue(),
                options.getMaxAnisotropy().getValue(),
                options.getCutoutLeaves().getValue(),
                options.getAo().getValue(),
                options.getImprovedTransparency().getValue(),
                options.getEntityShadows().getValue(),
                options.getVignette().getValue(),
                options.getChunkFade().getValue(),
                options.getChunkBuilderMode().getValue(),
                options.getDistortionEffectScale().getValue(),
                options.getFovEffectScale().getValue(),
                options.getDarknessEffectScale().getValue(),
                options.getGlintSpeed().getValue(),
                options.getGlintStrength().getValue(),
                options.getDamageTiltStrength().getValue(),
                options.getMenuBackgroundBlurriness().getValue()
            );
        }

        private void restore(GameOptions options) {
            options.applyGraphicsMode(graphicsMode);
            options.getEnableVsync().setValue(enableVsync);
            options.getMaxFps().setValue(maxFps);
            options.getViewDistance().setValue(viewDistance);
            options.getSimulationDistance().setValue(simulationDistance);
            options.getEntityDistanceScaling().setValue(entityDistanceScaling);
            options.getCloudRenderMode().setValue(cloudRenderMode);
            options.getCloudRenderDistance().setValue(cloudRenderDistance);
            options.getWeatherRadius().setValue(weatherRadius);
            options.getParticles().setValue(particlesMode);
            options.getBiomeBlendRadius().setValue(biomeBlendRadius);
            options.getMipmapLevels().setValue(mipmapLevels);
            options.getMaxAnisotropy().setValue(maxAnisotropy);
            options.getCutoutLeaves().setValue(cutoutLeaves);
            options.getAo().setValue(ao);
            options.getImprovedTransparency().setValue(improvedTransparency);
            options.getEntityShadows().setValue(entityShadows);
            options.getVignette().setValue(vignette);
            options.getChunkFade().setValue(chunkFade);
            options.getChunkBuilderMode().setValue(chunkBuilderMode);
            options.getDistortionEffectScale().setValue(distortionEffectScale);
            options.getFovEffectScale().setValue(fovEffectScale);
            options.getDarknessEffectScale().setValue(darknessEffectScale);
            options.getGlintSpeed().setValue(glintSpeed);
            options.getGlintStrength().setValue(glintStrength);
            options.getDamageTiltStrength().setValue(damageTiltStrength);
            options.getMenuBackgroundBlurriness().setValue(menuBackgroundBlurriness);
        }
    }
}
