package com.bloomunit.bloommenu.client.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

public final class BloomConfigManager {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("bloom-menu.json");
    private static BloomConfig config = load();

    private BloomConfigManager() {
    }

    public static BloomConfig get() {
        return config;
    }

    public static void set(BloomConfig next) {
        config = sanitize(next == null ? BloomConfig.defaultConfig() : next);
        save();
    }

    public static void save() {
        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            try (Writer writer = Files.newBufferedWriter(CONFIG_PATH)) {
                GSON.toJson(config, writer);
            }
        } catch (IOException ignored) {
        }
    }

    private static BloomConfig load() {
        if (!Files.exists(CONFIG_PATH)) {
            return BloomConfig.defaultConfig();
        }

        try (Reader reader = Files.newBufferedReader(CONFIG_PATH)) {
            BloomConfig loaded = GSON.fromJson(reader, BloomConfig.class);
            return sanitize(loaded == null ? BloomConfig.defaultConfig() : loaded);
        } catch (Exception ignored) {
            return BloomConfig.defaultConfig();
        }
    }

    private static BloomConfig sanitize(BloomConfig loaded) {
        if (loaded == null) {
            return BloomConfig.defaultConfig();
        }
        if (loaded.uiCorners == null || loaded.uiCorners.isBlank()) {
            loaded.uiCorners = "hard";
        }
        if (loaded.zoomStrength == null || loaded.zoomStrength.isBlank()) {
            loaded.zoomStrength = "3x";
        }
        if (loaded.hudTheme == null || loaded.hudTheme.isBlank()) {
            loaded.hudTheme = "bloom";
        }
        if (loaded.accentColor == null || loaded.accentColor.isBlank()) {
            loaded.accentColor = "mint";
        }
        if (loaded.fpsBoosterProfile == null || loaded.fpsBoosterProfile.isBlank()) {
            loaded.fpsBoosterProfile = "aggressive";
        }
        if (!loaded.fpsBoosterProfile.equals("balanced") && !loaded.fpsBoosterProfile.equals("aggressive") && !loaded.fpsBoosterProfile.equals("extreme")) {
            loaded.fpsBoosterProfile = "aggressive";
        }
        if (loaded.watermarkStyle == null || loaded.watermarkStyle.isBlank()) {
            loaded.watermarkStyle = "logo";
        }
        if (loaded.crosshairStyle == null || loaded.crosshairStyle.isBlank()) {
            loaded.crosshairStyle = "ring";
        }
        loaded.menuOpacity = Math.max(40, Math.min(100, loaded.menuOpacity == 0 ? 88 : loaded.menuOpacity));
        return loaded;
    }
}
