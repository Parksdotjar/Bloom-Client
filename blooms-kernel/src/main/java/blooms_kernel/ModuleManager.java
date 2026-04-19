package blooms_kernel;

import blooms_kernel.modules.Module;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import net.fabricmc.loader.api.FabricLoader;

public final class ModuleManager {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("blooms_kernel.json");

    private final List<Module> modules = new ArrayList<>();
    private final List<Module> enabledCache = new ArrayList<>();
    private boolean enabledDirty = true;

    public void register(Module module) {
        modules.add(module);
        enabledDirty = true;
    }

    public List<Module> getModules() {
        return Collections.unmodifiableList(modules);
    }

    public List<Module> getEnabledModules() {
        if (enabledDirty) {
            enabledCache.clear();
            for (Module module : modules) {
                if (module.isEnabled()) {
                    enabledCache.add(module);
                }
            }
            enabledDirty = false;
        }
        return enabledCache;
    }

    public Module getByName(String name) {
        String needle = name.toLowerCase(Locale.ROOT);
        for (Module module : modules) {
            if (module.getName().toLowerCase(Locale.ROOT).equals(needle)) {
                return module;
            }
        }
        return null;
    }

    public void renderEnabled(DrawContext context, MinecraftClient client) {
        for (Module module : getEnabledModules()) {
            module.render(context, client);
        }
    }

    public void tick(MinecraftClient client) {
        for (Module module : modules) {
            if (module.isEnabled()) {
                module.tick(client);
            }
        }
    }

    public void toggle(String name) {
        Module module = getByName(name);
        if (module == null) {
            return;
        }
        module.setEnabled(!module.isEnabled());
        enabledDirty = true;
        saveConfig();
    }

    public void markEnabledStateDirty() {
        enabledDirty = true;
    }

    public void saveConfig() {
        JsonObject root = new JsonObject();
        KernelUiConfig.writeTo(root);
        JsonObject modulesJson = new JsonObject();
        for (Module module : modules) {
            JsonObject node = new JsonObject();
            node.addProperty("enabled", module.isEnabled());
            node.addProperty("x", module.getX());
            node.addProperty("y", module.getY());
            node.addProperty("width", module.getWidth());
            node.addProperty("height", module.getHeight());
            modulesJson.add(module.getName().toUpperCase(Locale.ROOT), node);
        }
        root.add("modules", modulesJson);
        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            Files.writeString(CONFIG_PATH, GSON.toJson(root), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }

    public void loadConfig() {
        if (!Files.exists(CONFIG_PATH)) {
            return;
        }
        try {
            String raw = Files.readString(CONFIG_PATH, StandardCharsets.UTF_8);
            JsonObject root = GSON.fromJson(raw, JsonObject.class);
            if (root == null) {
                return;
            }
            KernelUiConfig.readFrom(root);
            if (!root.has("modules")) {
                return;
            }
            JsonObject modulesJson = root.getAsJsonObject("modules");
            Map<String, JsonObject> byName = new LinkedHashMap<>();
            for (Map.Entry<String, JsonElement> entry : modulesJson.entrySet()) {
                JsonElement value = entry.getValue();
                if (value != null && value.isJsonObject()) {
                    byName.put(entry.getKey().toUpperCase(Locale.ROOT), value.getAsJsonObject());
                }
            }
            for (Module module : modules) {
                JsonObject node = byName.get(module.getName().toUpperCase(Locale.ROOT));
                if (node == null) {
                    module.setEnabled(false);
                    continue;
                }
                module.setEnabled(node.has("enabled") && node.get("enabled").getAsBoolean());
                if (node.has("x")) module.setX(node.get("x").getAsInt());
                if (node.has("y")) module.setY(node.get("y").getAsInt());
                if (node.has("width")) module.setWidth(node.get("width").getAsInt());
                if (node.has("height")) module.setHeight(node.get("height").getAsInt());
            }
            enabledDirty = true;
        } catch (Exception ignored) {
        }
    }
}
