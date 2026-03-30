package com.bloomunit.bloommenu.client.cosmetics;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.texture.NativeImage;
import net.minecraft.client.texture.NativeImageBackedTexture;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URLEncoder;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class BloomCosmeticsManager {
    private static final Logger LOGGER = LoggerFactory.getLogger("BloomCosmetics");
    private static final String REALTIME_TOPIC = "realtime:public:commerce_cape_loadout_public";

    private static final BloomCosmeticsManager INSTANCE = new BloomCosmeticsManager();

    private final Gson gson = new Gson();
    private final ConcurrentMap<String, CachedLoadout> loadoutsByUuid = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Identifier> capeTextureByPlayer = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, TextureRecord> textureByCacheKey = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Long> nextLookupAllowedAt = new ConcurrentHashMap<>();
    private final AtomicInteger refCounter = new AtomicInteger(1);

    private final Map<String, Boolean> pendingLookups = new ConcurrentHashMap<>();
    private final Map<String, Boolean> pendingTextureDownloads = new ConcurrentHashMap<>();

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(new DaemonFactory("bloom-cosmetics-scheduler"));
    private final HttpClient httpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofSeconds(8))
        .build();

    private volatile BloomCosmeticsConfig config;
    private volatile String restBaseUrl = "";
    private volatile String realtimeWsUrl = "";
    private volatile WebSocket realtimeSocket;
    private volatile boolean initialized;
    private volatile boolean realtimeClosed;
    private volatile long nextRealtimeReconnectAt;
    private volatile long tickCounter;

    private BloomCosmeticsManager() {
    }

    public static BloomCosmeticsManager getInstance() {
        return INSTANCE;
    }

    public void initialize() {
        if (initialized) {
            return;
        }
        config = BloomCosmeticsConfigManager.get();
        if (!config.enabled) {
            initialized = true;
            LOGGER.info("Bloom Cosmetics is disabled in bloom-cosmetics.json.");
            return;
        }
        String normalizedBase = normalizeSupabaseUrl(config.supabaseUrl);
        if (normalizedBase.isBlank() || config.supabaseAnonKey.isBlank()) {
            initialized = true;
            LOGGER.warn("Bloom Cosmetics disabled at runtime because Supabase URL or anon key is missing.");
            return;
        }
        restBaseUrl = normalizedBase.endsWith("/rest/v1") ? normalizedBase : normalizedBase + "/rest/v1";
        realtimeWsUrl = buildRealtimeWebsocketUrl(normalizedBase, config.realtimeWsUrl, config.supabaseAnonKey);
        initialized = true;
        connectRealtime();
        LOGGER.info("Bloom Cosmetics initialized.");
    }

    public void shutdown() {
        realtimeClosed = true;
        WebSocket socket = realtimeSocket;
        realtimeSocket = null;
        if (socket != null) {
            try {
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "client_stop");
            } catch (Exception ignored) {
            }
        }
        scheduler.shutdownNow();
    }

    public void tick(MinecraftClient client) {
        if (!initialized || config == null || !config.enabled) {
            return;
        }
        tickCounter++;
        long now = System.currentTimeMillis();
        if (tickCounter % Math.max(1, config.resolveIntervalTicks) == 0) {
            observeVisiblePlayers(client, now);
            maybePrune(now);
        }
        if ((realtimeSocket == null || realtimeClosed) && now >= nextRealtimeReconnectAt) {
            connectRealtime();
        }
    }

    public Optional<Identifier> getCapeTexture(UUID playerUuid) {
        if (!initialized || playerUuid == null) {
            return Optional.empty();
        }
        String key = normalizeUuidKey(playerUuid.toString());
        if (key.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(capeTextureByPlayer.get(key));
    }

    private void observeVisiblePlayers(MinecraftClient client, long now) {
        if (client == null || client.world == null) {
            return;
        }
        for (AbstractClientPlayerEntity player : client.world.getPlayers()) {
            requestLookupIfNeeded(player.getUuidAsString(), now, false);
        }
        if (client.player != null) {
            requestLookupIfNeeded(client.player.getUuidAsString(), now, true);
        }
    }

    private void requestLookupIfNeeded(String uuidRaw, long now, boolean prioritize) {
        String key = normalizeUuidKey(uuidRaw);
        if (key.isBlank()) {
            return;
        }
        CachedLoadout current = loadoutsByUuid.get(key);
        long ttlMillis = (prioritize ? Math.min(config.cacheTtlSeconds, 6) : config.cacheTtlSeconds) * 1000L;
        if (current != null && now - current.fetchedAtMs <= ttlMillis) {
            return;
        }
        long cooldownMillis = (prioritize ? Math.min(config.resolveCooldownSeconds, 3) : config.resolveCooldownSeconds) * 1000L;
        long nextAllowed = nextLookupAllowedAt.getOrDefault(key, 0L);
        if (now < nextAllowed) {
            return;
        }
        if (pendingLookups.putIfAbsent(key, Boolean.TRUE) != null) {
            return;
        }
        nextLookupAllowedAt.put(key, now + cooldownMillis);
        fetchLoadoutAsync(key);
    }

    private void fetchLoadoutAsync(String normalizedUuidKey) {
        String dashed = toDashedUuid(normalizedUuidKey);
        URI uri = buildLookupUri(dashed, normalizedUuidKey);
        if (uri == null) {
            pendingLookups.remove(normalizedUuidKey);
            return;
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(config.httpTimeoutSeconds))
            .header("apikey", config.supabaseAnonKey)
            .header("Authorization", "Bearer " + config.supabaseAnonKey)
            .header("Accept", "application/json")
            .GET()
            .build();

        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .whenComplete((response, throwable) -> {
                pendingLookups.remove(normalizedUuidKey);
                if (throwable != null) {
                    LOGGER.debug("Bloom cosmetics loadout fetch failed uuid={} reason={}", normalizedUuidKey, throwable.toString());
                    return;
                }
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    LOGGER.debug("Bloom cosmetics loadout fetch non-200 uuid={} status={}", normalizedUuidKey, response.statusCode());
                    return;
                }
                try {
                    JsonElement parsed = JsonParser.parseString(response.body());
                    if (!parsed.isJsonArray()) {
                        return;
                    }
                    JsonArray array = parsed.getAsJsonArray();
                    if (array.isEmpty()) {
                        LOGGER.debug("Bloom cosmetics loadout empty uuid={}", normalizedUuidKey);
                        cacheNoCape(normalizedUuidKey);
                        return;
                    }
                    JsonObject row = array.get(0).getAsJsonObject();
                    applyLoadoutRow(row, false);
                } catch (Exception parseError) {
                    LOGGER.debug("Bloom cosmetics loadout parse failed uuid={} reason={}", normalizedUuidKey, parseError.toString());
                }
            });
    }

    private URI buildLookupUri(String dashedUuid, String normalizedUuid) {
        if (restBaseUrl.isBlank()) {
            return null;
        }
        String select = "mc_uuid,equipped_cape_id,texture_url,cape_slug,cape_name,rarity,rarity_label,updated_at";
        String orFilter = "(mc_uuid.eq." + dashedUuid + ",mc_uuid.eq." + normalizedUuid + ")";
        String query = "select=" + encode(select) + "&or=" + encode(orFilter) + "&limit=1";
        return URI.create(restBaseUrl + "/commerce_cape_loadout_public?" + query);
    }

    private void applyLoadoutRow(JsonObject row, boolean fromRealtime) {
        String mcUuid = readString(row, "mc_uuid");
        String key = normalizeUuidKey(mcUuid);
        if (key.isBlank()) {
            return;
        }
        String equippedCapeId = readString(row, "equipped_cape_id");
        String textureUrl = readString(row, "texture_url");
        String capeSlug = readString(row, "cape_slug");
        long updatedAtMs = parseTimestamp(readString(row, "updated_at"));
        if (equippedCapeId == null || textureUrl == null || textureUrl.isBlank()) {
            loadoutsByUuid.put(key, CachedLoadout.noCape(key, updatedAtMs));
            capeTextureByPlayer.remove(key);
            return;
        }
        CachedLoadout loadout = new CachedLoadout(
            key,
            textureUrl,
            capeSlug,
            readString(row, "cape_name"),
            readString(row, "rarity"),
            readString(row, "rarity_label"),
            updatedAtMs,
            System.currentTimeMillis()
        );
        loadoutsByUuid.put(key, loadout);
        String textureCacheKey = textureCacheKey(capeSlug, textureUrl);
        TextureRecord existing = textureByCacheKey.get(textureCacheKey);
        if (existing != null) {
            LOGGER.debug("Bloom cosmetics texture cache hit slug={} key={} url={}", capeSlug, textureCacheKey, textureUrl);
            capeTextureByPlayer.put(key, existing.textureId);
            return;
        }
        LOGGER.debug("Bloom cosmetics texture cache miss slug={} key={} url={} realtime={}", capeSlug, textureCacheKey, textureUrl, fromRealtime);
        queueTextureDownload(key, capeSlug, textureUrl, fromRealtime);
    }

    private void queueTextureDownload(String playerUuidKey, String capeSlug, String textureUrl, boolean fromRealtime) {
        if (textureUrl == null || textureUrl.isBlank()) {
            return;
        }
        String textureCacheKey = textureCacheKey(capeSlug, textureUrl);
        TextureRecord existing = textureByCacheKey.get(textureCacheKey);
        if (existing != null) {
            capeTextureByPlayer.put(playerUuidKey, existing.textureId);
            return;
        }
        if (pendingTextureDownloads.putIfAbsent(textureCacheKey, Boolean.TRUE) != null) {
            return;
        }
        LOGGER.debug("Bloom cosmetics texture download start slug={} key={} url={}", capeSlug, textureCacheKey, textureUrl);
        HttpRequest request = HttpRequest.newBuilder(URI.create(textureUrl))
            .timeout(Duration.ofSeconds(config.httpTimeoutSeconds))
            .header("Accept", "image/*")
            .GET()
            .build();
        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray())
            .whenComplete((response, throwable) -> {
                if (throwable != null) {
                    LOGGER.warn("Bloom cosmetics texture download failed slug={} key={} url={} reason={}", capeSlug, textureCacheKey, textureUrl, throwable.toString());
                    pendingTextureDownloads.remove(textureCacheKey);
                    return;
                }
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    LOGGER.warn("Bloom cosmetics texture download non-200 slug={} key={} status={} url={}", capeSlug, textureCacheKey, response.statusCode(), textureUrl);
                    pendingTextureDownloads.remove(textureCacheKey);
                    return;
                }
                MinecraftClient client = MinecraftClient.getInstance();
                if (client == null) {
                    pendingTextureDownloads.remove(textureCacheKey);
                    return;
                }
                byte[] imageBytes = response.body();
                LOGGER.debug("Bloom cosmetics texture bytes slug={} key={} bytes={} status=200 url={}", capeSlug, textureCacheKey, imageBytes.length, textureUrl);
                client.execute(() -> registerCapeTexture(textureCacheKey, capeSlug, textureUrl, imageBytes, fromRealtime));
            });
    }

    private void registerCapeTexture(String textureCacheKey, String capeSlug, String textureUrl, byte[] imageBytes, boolean fromRealtime) {
        try {
            TextureRecord already = textureByCacheKey.get(textureCacheKey);
            if (already != null) {
                pendingTextureDownloads.remove(textureCacheKey);
                return;
            }
            if (!isPng(imageBytes)) {
                LOGGER.warn("Bloom cosmetics texture rejected (not_png) slug={} key={} bytes={} url={}", capeSlug, textureCacheKey, imageBytes.length, textureUrl);
                pendingTextureDownloads.remove(textureCacheKey);
                return;
            }
            NativeImage image = NativeImage.read(imageBytes);
            int width = image.getWidth();
            int height = image.getHeight();
            if (!isPlausibleDimensions(width, height)) {
                LOGGER.warn("Bloom cosmetics texture rejected (invalid_dimensions) slug={} key={} size={}x{} bytes={} url={}", capeSlug, textureCacheKey, width, height, imageBytes.length, textureUrl);
                image.close();
                pendingTextureDownloads.remove(textureCacheKey);
                return;
            }
            String hash = Integer.toUnsignedString(textureUrl.hashCode(), 16);
            Identifier textureId = Identifier.of("bloommenu", "cosmetics/capes/" + hash);
            MinecraftClient client = MinecraftClient.getInstance();
            if (client == null || client.getTextureManager() == null) {
                image.close();
                pendingTextureDownloads.remove(textureCacheKey);
                return;
            }
            client.getTextureManager().destroyTexture(textureId);
            NativeImageBackedTexture dynamicTexture = new NativeImageBackedTexture(() -> "bloom_cape_" + hash, image);
            client.getTextureManager().registerTexture(textureId, dynamicTexture);
            textureByCacheKey.put(textureCacheKey, new TextureRecord(textureId, System.currentTimeMillis()));
            for (Map.Entry<String, CachedLoadout> entry : loadoutsByUuid.entrySet()) {
                CachedLoadout loadout = entry.getValue();
                if (textureCacheKey.equals(textureCacheKey(loadout.capeSlug, loadout.textureUrl))) {
                    capeTextureByPlayer.put(entry.getKey(), textureId);
                }
            }
            LOGGER.debug("Bloom cosmetics texture registered slug={} key={} size={}x{} id={} realtime={} url={}",
                capeSlug, textureCacheKey, width, height, textureId, fromRealtime, textureUrl);
        } catch (Exception decodeError) {
            LOGGER.warn("Bloom cosmetics texture decode/register failed slug={} key={} url={} reason={}",
                capeSlug, textureCacheKey, textureUrl, decodeError.toString());
        } finally {
            pendingTextureDownloads.remove(textureCacheKey);
        }
    }

    private void connectRealtime() {
        if (!initialized || config == null || !config.enabled || realtimeWsUrl.isBlank() || realtimeClosed) {
            return;
        }
        try {
            realtimeClosed = false;
            URI uri = URI.create(realtimeWsUrl);
            httpClient.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(config.httpTimeoutSeconds))
                .buildAsync(uri, new RealtimeListener())
                .exceptionally(throwable -> {
                    scheduleRealtimeReconnect();
                    return null;
                });
        } catch (Exception ignored) {
            scheduleRealtimeReconnect();
        }
    }

    private void sendRealtimeJoin(WebSocket socket) {
        JsonObject payload = new JsonObject();
        JsonObject configJson = new JsonObject();
        JsonObject broadcast = new JsonObject();
        broadcast.addProperty("ack", false);
        broadcast.addProperty("self", false);
        JsonObject presence = new JsonObject();
        presence.addProperty("key", "mc_uuid");
        JsonArray changes = new JsonArray();
        JsonObject change = new JsonObject();
        change.addProperty("event", "*");
        change.addProperty("schema", "public");
        change.addProperty("table", "commerce_cape_loadout_public");
        changes.add(change);
        configJson.add("broadcast", broadcast);
        configJson.add("presence", presence);
        configJson.add("postgres_changes", changes);
        configJson.addProperty("private", false);
        payload.add("config", configJson);

        JsonObject envelope = new JsonObject();
        envelope.addProperty("topic", REALTIME_TOPIC);
        envelope.addProperty("event", "phx_join");
        envelope.add("payload", payload);
        envelope.addProperty("ref", nextRef());
        socket.sendText(gson.toJson(envelope), true);
    }

    private void sendHeartbeat(WebSocket socket) {
        JsonObject envelope = new JsonObject();
        envelope.addProperty("topic", "phoenix");
        envelope.addProperty("event", "heartbeat");
        envelope.add("payload", new JsonObject());
        envelope.addProperty("ref", nextRef());
        socket.sendText(gson.toJson(envelope), true);
    }

    private void scheduleHeartbeat(WebSocket socket) {
        scheduler.scheduleAtFixedRate(() -> {
            if (realtimeSocket != socket || realtimeClosed) {
                return;
            }
            try {
                sendHeartbeat(socket);
            } catch (Exception ignored) {
            }
        }, config.websocketHeartbeatSeconds, config.websocketHeartbeatSeconds, TimeUnit.SECONDS);
    }

    private void handleRealtimeMessage(String message) {
        JsonObject envelope;
        try {
            JsonElement parsed = JsonParser.parseString(message);
            if (!parsed.isJsonObject()) {
                return;
            }
            envelope = parsed.getAsJsonObject();
        } catch (Exception ignored) {
            return;
        }
        String event = readString(envelope, "event");
        if ("phx_reply".equals(event)) {
            return;
        }
        if ("phx_error".equals(event) || "phx_close".equals(event)) {
            scheduleRealtimeReconnect();
            return;
        }
        if (!"postgres_changes".equals(event)) {
            return;
        }
        JsonObject payload = envelope.has("payload") && envelope.get("payload").isJsonObject()
            ? envelope.getAsJsonObject("payload")
            : null;
        if (payload == null) {
            return;
        }
        JsonObject data = payload.has("data") && payload.get("data").isJsonObject()
            ? payload.getAsJsonObject("data")
            : payload;
        String eventType = readString(data, "eventType");
        if ("DELETE".equalsIgnoreCase(eventType)) {
            JsonObject oldRow = data.has("old") && data.get("old").isJsonObject() ? data.getAsJsonObject("old") : null;
            if (oldRow != null) {
                String oldKey = normalizeUuidKey(readString(oldRow, "mc_uuid"));
                if (!oldKey.isBlank()) {
                    loadoutsByUuid.put(oldKey, CachedLoadout.noCape(oldKey, System.currentTimeMillis()));
                    capeTextureByPlayer.remove(oldKey);
                }
            }
            return;
        }
        JsonObject newRow = data.has("new") && data.get("new").isJsonObject() ? data.getAsJsonObject("new") : null;
        if (newRow == null) {
            return;
        }
        applyLoadoutRow(newRow, true);
    }

    private void scheduleRealtimeReconnect() {
        if (realtimeClosed) {
            return;
        }
        nextRealtimeReconnectAt = System.currentTimeMillis() + (config.websocketReconnectSeconds * 1000L);
        WebSocket socket = realtimeSocket;
        realtimeSocket = null;
        if (socket != null) {
            try {
                socket.abort();
            } catch (Exception ignored) {
            }
        }
    }

    private void cacheNoCape(String normalizedUuidKey) {
        loadoutsByUuid.put(normalizedUuidKey, CachedLoadout.noCape(normalizedUuidKey, System.currentTimeMillis()));
        capeTextureByPlayer.remove(normalizedUuidKey);
    }

    private void maybePrune(long now) {
        long staleCutoff = now - (config.cacheTtlSeconds * 4000L);
        loadoutsByUuid.entrySet().removeIf((entry) -> entry.getValue().fetchedAtMs < staleCutoff);
        nextLookupAllowedAt.entrySet().removeIf((entry) -> entry.getValue() < now - 120_000L);
    }

    private String buildRealtimeWebsocketUrl(String normalizedSupabaseUrl, String explicitRealtimeUrl, String anonKey) {
        String baseWs;
        if (explicitRealtimeUrl != null && !explicitRealtimeUrl.isBlank()) {
            baseWs = explicitRealtimeUrl.trim();
        } else {
            baseWs = normalizedSupabaseUrl.replaceFirst("^https://", "wss://").replaceFirst("^http://", "ws://");
            if (!baseWs.endsWith("/realtime/v1/websocket")) {
                if (baseWs.endsWith("/")) {
                    baseWs = baseWs.substring(0, baseWs.length() - 1);
                }
                baseWs = baseWs + "/realtime/v1/websocket";
            }
        }
        String query = "apikey=" + encode(anonKey) + "&vsn=1.0.0";
        return baseWs.contains("?") ? baseWs + "&" + query : baseWs + "?" + query;
    }

    private String normalizeSupabaseUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        try {
            URL parsed = new URL(raw.trim());
            String path = parsed.getPath() == null ? "" : parsed.getPath().replaceAll("/+$", "");
            if (path.startsWith("/project/")) {
                path = "";
            }
            String port = parsed.getPort() > 0 ? ":" + parsed.getPort() : "";
            return parsed.getProtocol() + "://" + parsed.getHost() + port + path;
        } catch (Exception ignored) {
            return raw.trim().replaceAll("/+$", "");
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String nextRef() {
        return String.valueOf(INSTANCE.refCounter.getAndIncrement());
    }

    private static String readString(JsonObject object, String key) {
        if (object == null || key == null || !object.has(key) || object.get(key).isJsonNull()) {
            return null;
        }
        JsonElement element = object.get(key);
        if (!element.isJsonPrimitive()) {
            return null;
        }
        return element.getAsString();
    }

    private static long parseTimestamp(String value) {
        if (value == null || value.isBlank()) {
            return System.currentTimeMillis();
        }
        try {
            return Instant.parse(value).toEpochMilli();
        } catch (Exception ignored) {
            return System.currentTimeMillis();
        }
    }

    private static String normalizeUuidKey(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String compact = raw.trim().toLowerCase(Locale.ROOT).replace("-", "");
        if (compact.length() != 32) {
            return "";
        }
        for (int i = 0; i < compact.length(); i++) {
            char c = compact.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            if (!hex) {
                return "";
            }
        }
        return compact;
    }

    private static String toDashedUuid(String normalizedUuid) {
        if (normalizedUuid == null || normalizedUuid.length() != 32) {
            return normalizedUuid;
        }
        return normalizedUuid.substring(0, 8) + "-"
            + normalizedUuid.substring(8, 12) + "-"
            + normalizedUuid.substring(12, 16) + "-"
            + normalizedUuid.substring(16, 20) + "-"
            + normalizedUuid.substring(20, 32);
    }

    private static String textureCacheKey(String capeSlug, String textureUrl) {
        String slug = capeSlug == null ? "" : capeSlug.trim().toLowerCase(Locale.ROOT);
        String url = textureUrl == null ? "" : textureUrl.trim();
        return slug + "::" + url;
    }

    private static boolean isPlausibleDimensions(int width, int height) {
        return width >= 16 && height >= 16 && width <= 4096 && height <= 4096;
    }

    private static boolean isPng(byte[] bytes) {
        if (bytes == null || bytes.length < 4) {
            return false;
        }
        return (bytes[0] & 0xff) == 0x89
            && (bytes[1] & 0xff) == 0x50
            && (bytes[2] & 0xff) == 0x4e
            && (bytes[3] & 0xff) == 0x47;
    }

    private record CachedLoadout(
        String uuidKey,
        String textureUrl,
        String capeSlug,
        String capeName,
        String rarity,
        String rarityLabel,
        long updatedAtMs,
        long fetchedAtMs
    ) {
        static CachedLoadout noCape(String uuidKey, long now) {
            return new CachedLoadout(uuidKey, null, null, null, null, null, now, now);
        }
    }

    private record TextureRecord(
        Identifier textureId,
        long loadedAtMs
    ) {
    }

    private static final class DaemonFactory implements ThreadFactory {
        private final String name;

        private DaemonFactory(String name) {
            this.name = name;
        }

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, name);
            thread.setDaemon(true);
            return thread;
        }
    }

    private final class RealtimeListener implements WebSocket.Listener {
        private final StringBuilder partial = new StringBuilder();

        @Override
        public void onOpen(WebSocket webSocket) {
            realtimeSocket = webSocket;
            sendRealtimeJoin(webSocket);
            scheduleHeartbeat(webSocket);
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                String payload = partial.toString();
                partial.setLength(0);
                handleRealtimeMessage(payload);
            }
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (!realtimeClosed) {
                scheduleRealtimeReconnect();
            }
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (!realtimeClosed) {
                scheduleRealtimeReconnect();
            }
        }
    }
}
