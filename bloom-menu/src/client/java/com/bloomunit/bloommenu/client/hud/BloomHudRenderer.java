package com.bloomunit.bloommenu.client.hud;

import com.bloomunit.bloommenu.BloomMenuMod;
import com.bloomunit.bloommenu.client.config.BloomConfig;
import com.bloomunit.bloommenu.client.config.BloomConfigManager;
import com.bloomunit.bloommenu.client.screen.BloomHudEditorScreen;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.item.BlockItem;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.BlockPos;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class BloomHudRenderer {
    private static final Identifier LOGO_TEXTURE = Identifier.of(BloomMenuMod.MOD_ID, "textures/gui/bloom_logo.png");
    private static final DateTimeFormatter CLOCK_FORMAT = DateTimeFormatter.ofPattern("h:mm a");

    private BloomHudRenderer() {
    }

    public static void register() {
        HudRenderCallback.EVENT.register(BloomHudRenderer::render);
    }

    private static void render(DrawContext context, net.minecraft.client.render.RenderTickCounter tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.options == null || client.textRenderer == null || client.options.hudHidden) {
            return;
        }
        if (client.currentScreen instanceof BloomHudEditorScreen) {
            return;
        }

        BloomConfig config = BloomConfigManager.get();
        ThemePalette palette = ThemePalette.resolve(config.hudTheme, config.accentColor, config.menuOpacity);
        for (String widgetId : enabledWidgetIds(config)) {
            WidgetBounds bounds = resolveBounds(client, context.getScaledWindowWidth(), context.getScaledWindowHeight(), config, widgetId);
            drawWidget(context, client, config, palette, widgetId, bounds, false, false);
        }
        if (config.crosshairEnabled && client.player != null && client.world != null) {
            renderCrosshair(context, palette, config.crosshairStyle, context.getScaledWindowWidth() / 2, context.getScaledWindowHeight() / 2);
        }
    }

    public static List<String> enabledWidgetIds(BloomConfig config) {
        List<String> ids = new ArrayList<>();
        if (config.watermark) ids.add("watermark");
        if (config.fpsCounter) ids.add("fpsCounter");
        if (config.ping) ids.add("ping");
        if (config.clock) ids.add("clock");
        if (config.coordinates) ids.add("coordinates");
        if (config.direction) ids.add("direction");
        if (config.sprintStatus) ids.add("sprintStatus");
        if (config.cps) ids.add("cps");
        if (config.keystrokes) ids.add("keystrokes");
        if (config.armorStatus) ids.add("armorStatus");
        if (config.potionEffectsHud) ids.add("potionEffects");
        if (config.itemCounterHud) ids.add("itemCounter");
        if (config.biomeWeatherHud) ids.add("biomeWeather");
        if (config.tpsDisplay) ids.add("tps");
        return ids;
    }

    public static void renderEditor(DrawContext context, String selectedId) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null || client.textRenderer == null) {
            return;
        }

        BloomConfig config = BloomConfigManager.get();
        ThemePalette palette = ThemePalette.resolve(config.hudTheme, config.accentColor, config.menuOpacity);
        int width = context.getScaledWindowWidth();
        int height = context.getScaledWindowHeight();
        context.fill(0, 0, width, height, 0xA0000000);

        for (String widgetId : enabledWidgetIds(config)) {
            WidgetBounds bounds = resolveBounds(client, context.getScaledWindowWidth(), context.getScaledWindowHeight(), config, widgetId);
            boolean selected = widgetId.equals(selectedId);
            drawWidget(context, client, config, palette, widgetId, bounds, true, selected);
        }
    }

    public static WidgetBounds resolveBounds(MinecraftClient client, int screenWidth, int screenHeight, BloomConfig config, String widgetId) {
        int[] baseSize = baseSizeForWidget(client, widgetId, config);
        BloomConfig.WidgetPlacement placement = config.placement(widgetId);
        float scale = Math.max(0.75F, Math.min(1.75F, placement.scale <= 0.0F ? 1.0F : placement.scale));
        int width = Math.round(baseSize[0] * scale);
        int height = Math.round(baseSize[1] * scale);
        int[] defaults = defaultPosition(widgetId, screenWidth, screenHeight, width, height);
        int x = placement.x == Integer.MIN_VALUE ? defaults[0] : placement.x;
        int y = placement.y == Integer.MIN_VALUE ? defaults[1] : placement.y;
        return new WidgetBounds(widgetId, x, y, width, height, scale);
    }

    public static void moveWidget(String widgetId, int x, int y) {
        BloomConfig.WidgetPlacement placement = BloomConfigManager.get().placement(widgetId);
        placement.x = x;
        placement.y = y;
        BloomConfigManager.save();
    }

    public static void resizeWidget(String widgetId, float scale) {
        BloomConfig.WidgetPlacement placement = BloomConfigManager.get().placement(widgetId);
        placement.scale = Math.max(0.75F, Math.min(1.75F, scale));
        BloomConfigManager.save();
    }

    private static int[] baseSizeForWidget(MinecraftClient client, String widgetId, BloomConfig config) {
        return switch (widgetId) {
            case "watermark" -> new int[] { "compact".equals(config.watermarkStyle) ? 82 : 150, "compact".equals(config.watermarkStyle) ? 20 : 34 };
            case "keystrokes" -> new int[] { 84, 82 };
            case "potionEffects" -> new int[] { 180, 88 };
            case "itemCounter" -> new int[] { 170, 18 };
            case "biomeWeather" -> new int[] { 190, 18 };
            case "tps" -> new int[] { 88, 18 };
            default -> new int[] { 118, 18 };
        };
    }

    private static int[] defaultPosition(String widgetId, int width, int height, int widgetWidth, int widgetHeight) {
        return switch (widgetId) {
            case "watermark" -> new int[] { 8, 8 };
            case "fpsCounter" -> new int[] { 8, 50 };
            case "ping" -> new int[] { width - widgetWidth - 8, 8 };
            case "clock" -> new int[] { width - widgetWidth - 8, 32 };
            case "coordinates" -> new int[] { 8, height - 100 };
            case "direction" -> new int[] { 8, height - 76 };
            case "sprintStatus" -> new int[] { 8, height - 52 };
            case "cps" -> new int[] { 8, height - 28 };
            case "keystrokes" -> new int[] { width - widgetWidth - 8, height - widgetHeight - 24 };
            case "armorStatus" -> new int[] { (width / 2) - (widgetWidth / 2), height - 28 };
            case "potionEffects" -> new int[] { 8, 74 };
            case "itemCounter" -> new int[] { width - widgetWidth - 8, height - 72 };
            case "biomeWeather" -> new int[] { width - widgetWidth - 8, 56 };
            case "tps" -> new int[] { width - widgetWidth - 8, 32 };
            default -> new int[] { 8, 8 };
        };
    }

    private static void drawWidget(DrawContext context, MinecraftClient client, BloomConfig config, ThemePalette palette, String widgetId, WidgetBounds bounds, boolean editor, boolean selected) {
        int x = bounds.x();
        int y = bounds.y();
        int width = bounds.width();
        int height = bounds.height();

        if (editor) {
            fillPanel(context, x - 4, y - 4, width + 8, height + 8, 0x74141A22, selected ? palette.accent : palette.border);
        }

        switch (widgetId) {
            case "watermark" -> drawWatermark(context, client, config, palette, x, y, width, height);
            case "keystrokes" -> drawKeystrokesWidget(context, client, palette, x, y, bounds.scale());
            case "armorStatus" -> drawChip(context, client, palette, "Armor " + armorValue(client, editor), x, y, width, false);
            case "coordinates" -> drawChip(context, client, palette, coordinatesLabel(client, editor), x, y, width, false);
            case "direction" -> drawChip(context, client, palette, "Facing " + resolveDirection(client, editor), x, y, width, false);
            case "sprintStatus" -> drawChip(context, client, palette, editor ? "Sprinting" : sprintLabel(client), x, y, width, false);
            case "cps" -> drawChip(context, client, palette, editor ? "8 L CPS  11 R CPS" : BloomHudTracker.leftCps() + " L CPS  " + BloomHudTracker.rightCps() + " R CPS", x, y, width, false);
            case "fpsCounter" -> drawChip(context, client, palette, "FPS  " + (editor ? "144" : client.getCurrentFps()), x, y, width, false);
            case "ping" -> drawChip(context, client, palette, "Ping  " + (editor ? "41" : resolvePing(client)), x, y, width, false);
            case "clock" -> drawChip(context, client, palette, "Clock  " + LocalTime.now().format(CLOCK_FORMAT), x, y, width, false);
            case "potionEffects" -> drawPotionEffects(context, client, palette, x, y, width, editor);
            case "itemCounter" -> drawItemCounter(context, client, palette, x, y, width, editor);
            case "biomeWeather" -> drawBiomeWeather(context, client, palette, x, y, width, editor);
            case "tps" -> drawChip(context, client, palette, "TPS  " + (editor ? "20" : BloomHudTracker.estimatedTps()), x, y, width, false);
            default -> drawChip(context, client, palette, widgetId, x, y, width, false);
        }

        if (editor) {
            int handle = 8;
            context.fill(x + width - handle, y + height - handle, x + width, y + height, selected ? palette.accent : palette.border);
        }
    }

    private static void drawWatermark(DrawContext context, MinecraftClient client, BloomConfig config, ThemePalette palette, int x, int y, int width, int height) {
        fillPanel(context, x, y, width, height, palette.panel, palette.border);
        if ("compact".equals(config.watermarkStyle)) {
            context.drawTexture(RenderPipelines.GUI_TEXTURED, LOGO_TEXTURE, x + 6, y + 4, 0.0F, 0.0F, 12, 12, 612, 408, 612, 408);
            context.drawText(client.textRenderer, Text.literal("Bloom"), x + 24, y + 6, palette.text, false);
            return;
        }

        context.drawTexture(RenderPipelines.GUI_TEXTURED, LOGO_TEXTURE, x + 8, y + 7, 0.0F, 0.0F, 20, 14, 612, 408, 612, 408);
        context.drawText(client.textRenderer, Text.literal("Bloom Client"), x + 34, y + 8, palette.text, false);
        context.drawText(client.textRenderer, Text.literal("1.21.11 Fabric"), x + 34, y + 19, palette.muted, false);
    }

    private static void drawKeystrokesWidget(DrawContext context, MinecraftClient client, ThemePalette palette, int x, int y, float scale) {
        boolean editor = client.currentScreen instanceof BloomHudEditorScreen;
        drawKey(context, client, palette, "W", x + Math.round(30 * scale), y, editor || client.options.forwardKey.isPressed(), Math.round(24 * scale));
        drawKey(context, client, palette, "A", x, y + Math.round(26 * scale), editor || client.options.leftKey.isPressed(), Math.round(24 * scale));
        drawKey(context, client, palette, "S", x + Math.round(30 * scale), y + Math.round(26 * scale), editor || client.options.backKey.isPressed(), Math.round(24 * scale));
        drawKey(context, client, palette, "D", x + Math.round(60 * scale), y + Math.round(26 * scale), editor || client.options.rightKey.isPressed(), Math.round(24 * scale));
        drawKey(context, client, palette, "LMB", x, y + Math.round(56 * scale), editor || client.options.attackKey.isPressed(), Math.round(38 * scale));
        drawKey(context, client, palette, "RMB", x + Math.round(46 * scale), y + Math.round(56 * scale), editor || client.options.useKey.isPressed(), Math.round(38 * scale));
    }

    private static void drawPotionEffects(DrawContext context, MinecraftClient client, ThemePalette palette, int x, int y, int width, boolean editor) {
        fillPanel(context, x, y, width, 88, palette.panel, palette.border);
        context.drawText(client.textRenderer, Text.literal("Effects"), x + 8, y + 6, palette.text, false);
        if (editor || client.player == null) {
            context.drawText(client.textRenderer, Text.literal("Speed II  1:20"), x + 8, y + 22, palette.muted, false);
            context.drawText(client.textRenderer, Text.literal("Strength I  0:42"), x + 8, y + 34, palette.muted, false);
            context.drawText(client.textRenderer, Text.literal("Resistance  0:55"), x + 8, y + 46, palette.muted, false);
            return;
        }

        int lineY = y + 22;
        int shown = 0;
        for (var effect : client.player.getStatusEffects()) {
            if (shown >= 5) {
                break;
            }
            int ticks = Math.max(0, effect.getDuration());
            int seconds = ticks / 20;
            String time = String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
            String label = effect.getEffectType().value().getName().getString() + "  " + time;
            context.drawText(client.textRenderer, Text.literal(label), x + 8, lineY, palette.muted, false);
            lineY += 12;
            shown++;
        }
        if (shown == 0) {
            context.drawText(client.textRenderer, Text.literal("No active effects"), x + 8, lineY, palette.muted, false);
        }
    }

    private static void drawItemCounter(DrawContext context, MinecraftClient client, ThemePalette palette, int x, int y, int width, boolean editor) {
        if (editor || client.player == null) {
            drawChip(context, client, palette, "Items  A:64  P:8  B:512  T:2", x, y, width, false);
            return;
        }
        int arrows = countItem(client, Items.ARROW);
        int pearls = countItem(client, Items.ENDER_PEARL);
        int totems = countItem(client, Items.TOTEM_OF_UNDYING);
        int blocks = countBlocks(client);
        drawChip(context, client, palette, "Items  A:" + arrows + "  P:" + pearls + "  B:" + blocks + "  T:" + totems, x, y, width, false);
    }

    private static void drawBiomeWeather(DrawContext context, MinecraftClient client, ThemePalette palette, int x, int y, int width, boolean editor) {
        if (editor || client.player == null || client.world == null) {
            drawChip(context, client, palette, "Biome  Plains | Weather Clear", x, y, width, false);
            return;
        }
        BlockPos pos = client.player.getBlockPos();
        String biome = client.world.getBiome(pos).getKey()
            .map(value -> value.getValue().getPath().replace('_', ' '))
            .orElse("unknown");
        String weather = client.world.isThundering() ? "Thunder" : client.world.isRaining() ? "Rain" : "Clear";
        drawChip(context, client, palette, "Biome  " + capitalizeWords(biome) + " | Weather " + weather, x, y, width, false);
    }

    private static int countItem(MinecraftClient client, net.minecraft.item.Item item) {
        if (client.player == null) {
            return 0;
        }
        int count = 0;
        var inventory = client.player.getInventory();
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (stack.isOf(item)) {
                count += stack.getCount();
            }
        }
        return count;
    }

    private static int countBlocks(MinecraftClient client) {
        if (client.player == null) {
            return 0;
        }
        int count = 0;
        var inventory = client.player.getInventory();
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (stack.getItem() instanceof BlockItem) {
                count += stack.getCount();
            }
        }
        return count;
    }

    private static String capitalizeWords(String value) {
        String[] parts = value.split(" ");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.toString();
    }

    private static void drawChip(DrawContext context, MinecraftClient client, ThemePalette palette, String text, int x, int y, int width, boolean emphasize) {
        fillPanel(context, x, y, width, 18, emphasize ? palette.panel : palette.softPanel, emphasize ? palette.accent : palette.border);
        context.drawText(client.textRenderer, Text.literal(text), x + 8, y + 5, palette.text, false);
    }

    private static void drawKey(DrawContext context, MinecraftClient client, ThemePalette palette, String label, int x, int y, boolean pressed, int width) {
        fillPanel(context, x, y, width, 22, pressed ? palette.accentPanel : palette.softPanel, pressed ? palette.accent : palette.border);
        context.drawCenteredTextWithShadow(client.textRenderer, Text.literal(label), x + (width / 2), y + 7, pressed ? 0xFF08110E : palette.text);
    }

    private static void fillPanel(DrawContext context, int x, int y, int width, int height, int fill, int border) {
        boolean smoothCorners = "smooth".equalsIgnoreCase(BloomConfigManager.get().uiCorners);
        if (!smoothCorners) {
            context.fill(x, y, x + width, y + height, fill);
            context.fill(x, y, x + width, y + 1, border);
            context.fill(x, y + height - 1, x + width, y + height, border);
            context.fill(x, y, x + 1, y + height, border);
            context.fill(x + width - 1, y, x + width, y + height, border);
            return;
        }

        context.fill(x + 1, y, x + width - 1, y + height, fill);
        context.fill(x, y + 1, x + width, y + height - 1, fill);
        context.fill(x + 1, y, x + width - 1, y + 1, border);
        context.fill(x + 1, y + height - 1, x + width - 1, y + height, border);
        context.fill(x, y + 1, x + 1, y + height - 1, border);
        context.fill(x + width - 1, y + 1, x + width, y + height - 1, border);
    }

    private static int resolvePing(MinecraftClient client) {
        if (client.player == null || client.getNetworkHandler() == null) {
            return 0;
        }
        var entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
        return entry == null ? 0 : entry.getLatency();
    }

    private static String coordinatesLabel(MinecraftClient client, boolean editor) {
        if (editor || client.player == null) {
            return "XYZ 128 64 -48";
        }
        return String.format("XYZ %.0f %.0f %.0f", client.player.getX(), client.player.getY(), client.player.getZ());
    }

    private static String sprintLabel(MinecraftClient client) {
        if (client.player == null) {
            return "Sprinting";
        }
        return client.player.isSprinting() ? "Sprinting" : "Walking";
    }

    private static int armorValue(MinecraftClient client, boolean editor) {
        return editor || client.player == null ? 20 : client.player.getArmor();
    }

    private static void renderCrosshair(DrawContext context, ThemePalette palette, String style, int centerX, int centerY) {
        switch (style) {
            case "dot" -> context.fill(centerX - 1, centerY - 1, centerX + 1, centerY + 1, palette.accent);
            case "plus" -> {
                context.fill(centerX - 6, centerY, centerX - 2, centerY + 1, palette.accent);
                context.fill(centerX + 3, centerY, centerX + 7, centerY + 1, palette.accent);
                context.fill(centerX, centerY - 6, centerX + 1, centerY - 2, palette.accent);
                context.fill(centerX, centerY + 3, centerX + 1, centerY + 7, palette.accent);
            }
            default -> {
                context.fill(centerX - 5, centerY - 5, centerX + 5, centerY - 4, palette.accent);
                context.fill(centerX - 5, centerY + 4, centerX + 5, centerY + 5, palette.accent);
                context.fill(centerX - 5, centerY - 5, centerX - 4, centerY + 5, palette.accent);
                context.fill(centerX + 4, centerY - 5, centerX + 5, centerY + 5, palette.accent);
            }
        }
    }

    private static String resolveDirection(MinecraftClient client, boolean editor) {
        if (editor || client.player == null) {
            return "North";
        }
        float wrapped = client.player.getYaw() % 360.0F;
        if (wrapped < 0) {
            wrapped += 360.0F;
        }
        if (wrapped >= 45.0F && wrapped < 135.0F) {
            return "West";
        }
        if (wrapped >= 135.0F && wrapped < 225.0F) {
            return "North";
        }
        if (wrapped >= 225.0F && wrapped < 315.0F) {
            return "East";
        }
        return "South";
    }

    public record WidgetBounds(String id, int x, int y, int width, int height, float scale) {
        public boolean contains(double mouseX, double mouseY) {
            return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
        }

        public boolean inResizeHandle(double mouseX, double mouseY) {
            return mouseX >= x + width - 10 && mouseX <= x + width && mouseY >= y + height - 10 && mouseY <= y + height;
        }
    }

    private record ThemePalette(int panel, int softPanel, int accentPanel, int border, int accent, int text, int muted) {
        private static ThemePalette resolve(String theme, String accent, int opacity) {
            int resolvedAccent = switch (accent) {
                case "rose" -> 0xFFF26A8D;
                case "gold" -> 0xFFF2C14E;
                case "ice" -> 0xFF75D7FF;
                case "violet" -> 0xFFAE8BFF;
                case "crimson" -> 0xFFFF6B6B;
                case "ocean" -> 0xFF4FC3F7;
                default -> 0xFF7BE6BD;
            };

            int panelAlpha = Math.round((Math.max(40, Math.min(100, opacity)) / 100.0F) * 255.0F);
            int softAlpha = Math.max(60, panelAlpha - 24);
            return switch (theme) {
                case "midnight" -> new ThemePalette(argb(panelAlpha, 16, 17, 23), argb(softAlpha, 18, 24, 32), 0xD5233B35, 0xFF31384A, resolvedAccent, 0xFFF5F7FB, 0xFF9BA5B7);
                case "frost" -> new ThemePalette(argb(panelAlpha, 20, 28, 36), argb(softAlpha, 24, 34, 46), 0xD52E485A, 0xFF466175, resolvedAccent, 0xFFF3F9FF, 0xFFA5B7C7);
                case "graphite" -> new ThemePalette(argb(panelAlpha, 14, 16, 20), argb(softAlpha, 18, 20, 25), 0xD527313D, 0xFF303744, resolvedAccent, 0xFFF1F3F7, 0xFF949CAB);
                case "obsidian" -> new ThemePalette(argb(panelAlpha, 8, 10, 14), argb(softAlpha, 12, 14, 18), 0xD51C232F, 0xFF262F3D, resolvedAccent, 0xFFF5F7FA, 0xFF8E98AB);
                case "void" -> new ThemePalette(argb(panelAlpha, 4, 5, 8), argb(softAlpha, 9, 10, 14), 0xD5172028, 0xFF232B38, resolvedAccent, 0xFFF5F7FA, 0xFF838EA3);
                default -> new ThemePalette(argb(panelAlpha, 18, 21, 28), argb(softAlpha, 24, 29, 38), 0xD5234A3F, 0xFF2F3943, resolvedAccent, 0xFFF7FAFC, 0xFF9AA4B2);
            };
        }

        private static int argb(int alpha, int red, int green, int blue) {
            return ((alpha & 0xFF) << 24) | ((red & 0xFF) << 16) | ((green & 0xFF) << 8) | (blue & 0xFF);
        }
    }
}
