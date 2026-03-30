package com.bloomunit.bloommenu.client.cosmetics;

public final class BloomCosmeticsConfig {
    public boolean enabled = true;
    public String supabaseUrl = "https://sb.bloomclient.org/project/default";
    public String supabaseAnonKey = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NDE5NTMyMCwiZXhwIjo0OTI5ODY4OTIwLCJyb2xlIjoiYW5vbiJ9.snzMxBtGE48BsfFG2uhh6-Ms_fqQTbmasL-TkIco4K8";
    public String realtimeWsUrl = "";
    public int resolveIntervalTicks = 20;
    public int resolveCooldownSeconds = 12;
    public int cacheTtlSeconds = 90;
    public int httpTimeoutSeconds = 12;
    public int websocketReconnectSeconds = 5;
    public int websocketHeartbeatSeconds = 20;

    public static BloomCosmeticsConfig defaults() {
        return new BloomCosmeticsConfig();
    }

    public BloomCosmeticsConfig sanitized() {
        if (supabaseUrl == null) supabaseUrl = "";
        if (supabaseAnonKey == null) supabaseAnonKey = "";
        if (realtimeWsUrl == null) realtimeWsUrl = "";
        resolveIntervalTicks = clamp(resolveIntervalTicks, 10, 80, 20);
        resolveCooldownSeconds = clamp(resolveCooldownSeconds, 3, 60, 12);
        cacheTtlSeconds = clamp(cacheTtlSeconds, 20, 900, 90);
        httpTimeoutSeconds = clamp(httpTimeoutSeconds, 3, 60, 12);
        websocketReconnectSeconds = clamp(websocketReconnectSeconds, 2, 60, 5);
        websocketHeartbeatSeconds = clamp(websocketHeartbeatSeconds, 10, 60, 20);
        return this;
    }

    private static int clamp(int value, int min, int max, int fallback) {
        int source = value == 0 ? fallback : value;
        return Math.max(min, Math.min(max, source));
    }
}
