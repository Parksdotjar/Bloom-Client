package com.bloomunit.bloommenu.client.config;

import java.util.HashMap;
import java.util.Map;

public final class BloomConfig {
    public boolean fpsBooster = false;
    public boolean watermark = true;
    public boolean coordinates = true;
    public boolean armorStatus = true;
    public boolean cps = true;
    public boolean fpsCounter = true;
    public boolean clock = false;
    public boolean ping = true;
    public boolean sprintStatus = true;
    public boolean direction = false;
    public boolean keystrokes = false;
    public boolean potionEffectsHud = true;
    public boolean itemCounterHud = true;
    public boolean biomeWeatherHud = false;
    public boolean tpsDisplay = false;
    public boolean crosshairEnabled = true;
    public boolean zoomEnabled = true;
    public boolean toggleSprintSneak = false;

    public String hudTheme = "bloom";
    public String accentColor = "mint";
    public String fpsBoosterProfile = "aggressive";
    public String watermarkStyle = "logo";
    public String crosshairStyle = "ring";
    public String uiCorners = "hard";
    public String zoomStrength = "3x";
    public int menuOpacity = 88;
    public final Map<String, WidgetPlacement> placements = new HashMap<>();

    public WidgetPlacement placement(String id) {
        return placements.computeIfAbsent(id, ignored -> new WidgetPlacement());
    }

    public static BloomConfig defaultConfig() {
        return new BloomConfig();
    }

    public static BloomConfig pvpPreset() {
        BloomConfig config = new BloomConfig();
        config.fpsBooster = false;
        config.clock = false;
        config.coordinates = false;
        config.direction = true;
        config.keystrokes = true;
        config.crosshairStyle = "plus";
        config.watermarkStyle = "compact";
        return config;
    }

    public static BloomConfig streamerPreset() {
        BloomConfig config = new BloomConfig();
        config.fpsBooster = false;
        config.armorStatus = false;
        config.cps = false;
        config.direction = true;
        config.clock = true;
        config.hudTheme = "midnight";
        config.accentColor = "rose";
        config.menuOpacity = 84;
        config.watermarkStyle = "wordmark";
        return config;
    }

    public static BloomConfig minimalPreset() {
        BloomConfig config = new BloomConfig();
        config.fpsBooster = true;
        config.fpsBoosterProfile = "aggressive";
        config.coordinates = false;
        config.armorStatus = false;
        config.cps = false;
        config.ping = false;
        config.sprintStatus = false;
        config.direction = false;
        config.keystrokes = false;
        config.clock = true;
        config.hudTheme = "graphite";
        config.accentColor = "gold";
        config.menuOpacity = 78;
        config.watermarkStyle = "compact";
        config.crosshairStyle = "dot";
        return config;
    }

    public static final class WidgetPlacement {
        public int x = Integer.MIN_VALUE;
        public int y = Integer.MIN_VALUE;
        public float scale = 1.0F;
    }
}
