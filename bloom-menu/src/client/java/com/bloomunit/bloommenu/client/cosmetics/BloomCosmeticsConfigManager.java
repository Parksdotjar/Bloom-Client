package com.bloomunit.bloommenu.client.cosmetics;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;

import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

public final class BloomCosmeticsConfigManager {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("bloom-cosmetics.json");
    private static BloomCosmeticsConfig config = load();

    private BloomCosmeticsConfigManager() {
    }

    public static BloomCosmeticsConfig get() {
        return config;
    }

    public static void set(BloomCosmeticsConfig next) {
        config = (next == null ? BloomCosmeticsConfig.defaults() : next).sanitized();
        save();
    }

    public static void save() {
        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            try (Writer writer = Files.newBufferedWriter(CONFIG_PATH)) {
                GSON.toJson(config, writer);
            }
        } catch (Exception ignored) {
        }
    }

    private static BloomCosmeticsConfig load() {
        BloomCosmeticsConfig defaults = BloomCosmeticsConfig.defaults().sanitized();
        if (!Files.exists(CONFIG_PATH)) {
            config = defaults;
            save();
            return defaults;
        }
        try (Reader reader = Files.newBufferedReader(CONFIG_PATH)) {
            BloomCosmeticsConfig loaded = GSON.fromJson(reader, BloomCosmeticsConfig.class);
            return (loaded == null ? defaults : loaded).sanitized();
        } catch (Exception ignored) {
            return defaults;
        }
    }
}
