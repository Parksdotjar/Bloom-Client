package blooms_kernel;

import com.google.gson.JsonObject;

public final class KernelUiConfig {
    private static final int DEFAULT_ON_COLOR = 0x55FF55;
    private static final int DEFAULT_OFF_COLOR = 0xFF5555;
    private static final int DEFAULT_MODULE_BG_ALPHA = 0x66;
    private static final int DEFAULT_CROSSHAIR_LENGTH = 4;
    private static final int DEFAULT_CROSSHAIR_THICKNESS = 2;
    private static final int DEFAULT_CROSSHAIR_GAP = 3;
    private static final int DEFAULT_CROSSHAIR_DOT_SIZE = 2;
    private static final boolean DEFAULT_CROSSHAIR_DOT = true;
    private static final boolean DEFAULT_CROSSHAIR_LINES = true;
    private static final boolean DEFAULT_CROSSHAIR_OUTLINE = true;
    private static final int DEFAULT_CROSSHAIR_COLOR = 0xFFFFFF;
    private static final int DEFAULT_CROSSHAIR_ROTATION = 0;
    private static final int DEFAULT_TARGET_CROSSHAIR_LENGTH = 6;
    private static final int DEFAULT_TARGET_CROSSHAIR_THICKNESS = 2;
    private static final int DEFAULT_TARGET_CROSSHAIR_GAP = 2;
    private static final int DEFAULT_TARGET_CROSSHAIR_DOT_SIZE = 2;
    private static final boolean DEFAULT_TARGET_CROSSHAIR_DOT = true;
    private static final boolean DEFAULT_TARGET_CROSSHAIR_LINES = true;
    private static final boolean DEFAULT_TARGET_CROSSHAIR_OUTLINE = true;
    private static final int DEFAULT_TARGET_CROSSHAIR_COLOR = 0xFF6B8A;
    private static final int DEFAULT_TARGET_CROSSHAIR_ROTATION = 45;
    private static final int DEFAULT_ZOOM_FOV = 30;
    private static final double DEFAULT_ZOOM_SMOOTHING = 0.22D;
    private static final int DEFAULT_MOTION_BLUR_PASSES = 1;
    private static final int DEFAULT_FULLBRIGHT_GAMMA = 1500;
    private static final double DEFAULT_LOW_SHIELD_Y = 0.25D;
    private static final double DEFAULT_LOW_FIRE_Y = 0.25D;
    private static final double DEFAULT_MINI_ITEMS_SCALE = 0.75D;
    private static final int DEFAULT_MINI_ITEMS_PRESET = 1;
    private static final double DEFAULT_INVENTORY_START_DEPTH = 0.72D;
    private static final double DEFAULT_INVENTORY_SPEED = 7.0D;
    private static final double DEFAULT_INVENTORY_SMOOTHNESS = 0.18D;
    private static final int DEFAULT_INVENTORY_EASING = 2;
    private static final double DEFAULT_CHAT_OPACITY = 1.0D;
    private static final double DEFAULT_CHAT_LINE_SPACING = 0.0D;
    private static final double DEFAULT_CHAT_WIDTH = 1.0D;
    private static final double DEFAULT_CHAT_HEIGHT_FOCUSED = 1.0D;
    private static final double DEFAULT_CHAT_HEIGHT_UNFOCUSED = 0.8D;
    private static final boolean DEFAULT_FPS_SHOW_LABEL = true;
    private static final boolean DEFAULT_PING_SHOW_UNITS = true;
    private static final boolean DEFAULT_CPS_SHOW_LABELS = true;
    private static final boolean DEFAULT_COMPASS_SHOW_DEGREES = true;
    private static final boolean DEFAULT_DIRECTION_SHOW_DEGREES = true;
    private static final boolean DEFAULT_COORDINATES_SHOW_NETHER_CONVERSION = true;
    private static final int DEFAULT_SPEED_DECIMALS = 2;
    private static final int DEFAULT_HEALTH_DECIMALS = 1;
    private static final boolean DEFAULT_BIOME_TITLE_CASE = false;
    private static final boolean DEFAULT_BLOCK_DETECT_SHOW_NAMESPACE = false;
    private static final boolean DEFAULT_ARMOR_HORIZONTAL = true;
    private static final int DEFAULT_ARMOR_SPACING = 54;
    private static final boolean DEFAULT_ARMOR_SHOW_DURABILITY = true;
    private static final boolean DEFAULT_ARMOR_SLOT_STYLE = true;
    private static final int DEFAULT_ARMOR_TEXT_SCALE = 85;
    private static final int DEFAULT_ARMOR_TEXT_POSITION = 0;
    private static final boolean DEFAULT_FREE_LOOK_FRONT = false;
    private static final int DEFAULT_NO_HURT_CAM_STRENGTH = 0;
    private static final boolean DEFAULT_AUTO_SPRINT_ALLOW_ITEM_USE = false;

    private static int onColor = DEFAULT_ON_COLOR;
    private static int offColor = DEFAULT_OFF_COLOR;
    private static int moduleBackgroundAlpha = DEFAULT_MODULE_BG_ALPHA;
    private static int crosshairLength = DEFAULT_CROSSHAIR_LENGTH;
    private static int crosshairThickness = DEFAULT_CROSSHAIR_THICKNESS;
    private static int crosshairGap = DEFAULT_CROSSHAIR_GAP;
    private static int crosshairDotSize = DEFAULT_CROSSHAIR_DOT_SIZE;
    private static boolean crosshairDotEnabled = DEFAULT_CROSSHAIR_DOT;
    private static boolean crosshairLinesEnabled = DEFAULT_CROSSHAIR_LINES;
    private static boolean crosshairOutlineEnabled = DEFAULT_CROSSHAIR_OUTLINE;
    private static int crosshairColor = DEFAULT_CROSSHAIR_COLOR;
    private static int crosshairRotation = DEFAULT_CROSSHAIR_ROTATION;
    private static int targetCrosshairLength = DEFAULT_TARGET_CROSSHAIR_LENGTH;
    private static int targetCrosshairThickness = DEFAULT_TARGET_CROSSHAIR_THICKNESS;
    private static int targetCrosshairGap = DEFAULT_TARGET_CROSSHAIR_GAP;
    private static int targetCrosshairDotSize = DEFAULT_TARGET_CROSSHAIR_DOT_SIZE;
    private static boolean targetCrosshairDotEnabled = DEFAULT_TARGET_CROSSHAIR_DOT;
    private static boolean targetCrosshairLinesEnabled = DEFAULT_TARGET_CROSSHAIR_LINES;
    private static boolean targetCrosshairOutlineEnabled = DEFAULT_TARGET_CROSSHAIR_OUTLINE;
    private static int targetCrosshairColor = DEFAULT_TARGET_CROSSHAIR_COLOR;
    private static int targetCrosshairRotation = DEFAULT_TARGET_CROSSHAIR_ROTATION;
    private static int zoomFov = DEFAULT_ZOOM_FOV;
    private static double zoomSmoothing = DEFAULT_ZOOM_SMOOTHING;
    private static int motionBlurPasses = DEFAULT_MOTION_BLUR_PASSES;
    private static int fullbrightGamma = DEFAULT_FULLBRIGHT_GAMMA;
    private static double lowShieldYOffset = DEFAULT_LOW_SHIELD_Y;
    private static double lowFireYOffset = DEFAULT_LOW_FIRE_Y;
    private static double miniItemsScale = DEFAULT_MINI_ITEMS_SCALE;
    private static int miniItemsPreset = DEFAULT_MINI_ITEMS_PRESET;
    private static double inventoryStartDepth = DEFAULT_INVENTORY_START_DEPTH;
    private static double inventorySpeed = DEFAULT_INVENTORY_SPEED;
    private static double inventorySmoothing = DEFAULT_INVENTORY_SMOOTHNESS;
    private static int inventoryEasing = DEFAULT_INVENTORY_EASING;
    private static double chatOpacity = DEFAULT_CHAT_OPACITY;
    private static double chatLineSpacing = DEFAULT_CHAT_LINE_SPACING;
    private static double chatWidth = DEFAULT_CHAT_WIDTH;
    private static double chatHeightFocused = DEFAULT_CHAT_HEIGHT_FOCUSED;
    private static double chatHeightUnfocused = DEFAULT_CHAT_HEIGHT_UNFOCUSED;
    private static boolean fpsShowLabel = DEFAULT_FPS_SHOW_LABEL;
    private static boolean pingShowUnits = DEFAULT_PING_SHOW_UNITS;
    private static boolean cpsShowLabels = DEFAULT_CPS_SHOW_LABELS;
    private static boolean compassShowDegrees = DEFAULT_COMPASS_SHOW_DEGREES;
    private static boolean directionShowDegrees = DEFAULT_DIRECTION_SHOW_DEGREES;
    private static boolean coordinatesShowNetherConversion = DEFAULT_COORDINATES_SHOW_NETHER_CONVERSION;
    private static int speedDecimals = DEFAULT_SPEED_DECIMALS;
    private static int healthDecimals = DEFAULT_HEALTH_DECIMALS;
    private static boolean biomeTitleCase = DEFAULT_BIOME_TITLE_CASE;
    private static boolean blockDetectShowNamespace = DEFAULT_BLOCK_DETECT_SHOW_NAMESPACE;
    private static boolean armorHorizontal = DEFAULT_ARMOR_HORIZONTAL;
    private static int armorSpacing = DEFAULT_ARMOR_SPACING;
    private static boolean armorShowDurability = DEFAULT_ARMOR_SHOW_DURABILITY;
    private static boolean armorSlotStyle = DEFAULT_ARMOR_SLOT_STYLE;
    private static int armorTextScale = DEFAULT_ARMOR_TEXT_SCALE;
    private static int armorTextPosition = DEFAULT_ARMOR_TEXT_POSITION;
    private static boolean freeLookFront = DEFAULT_FREE_LOOK_FRONT;
    private static int noHurtCamStrength = DEFAULT_NO_HURT_CAM_STRENGTH;
    private static boolean autoSprintAllowItemUse = DEFAULT_AUTO_SPRINT_ALLOW_ITEM_USE;

    private KernelUiConfig() {
    }

    public static int getOnColor() {
        return onColor;
    }

    public static void setOnColor(int color) {
        onColor = color & 0xFFFFFF;
    }

    public static int getOffColor() {
        return offColor;
    }

    public static void setOffColor(int color) {
        offColor = color & 0xFFFFFF;
    }

    public static int getModuleBackgroundAlpha() {
        return moduleBackgroundAlpha;
    }

    public static void setModuleBackgroundAlpha(int alpha) {
        moduleBackgroundAlpha = Math.max(0, Math.min(255, alpha));
    }

    public static void resetDefaults() {
        onColor = DEFAULT_ON_COLOR;
        offColor = DEFAULT_OFF_COLOR;
        moduleBackgroundAlpha = DEFAULT_MODULE_BG_ALPHA;
        crosshairLength = DEFAULT_CROSSHAIR_LENGTH;
        crosshairThickness = DEFAULT_CROSSHAIR_THICKNESS;
        crosshairGap = DEFAULT_CROSSHAIR_GAP;
        crosshairDotSize = DEFAULT_CROSSHAIR_DOT_SIZE;
        crosshairDotEnabled = DEFAULT_CROSSHAIR_DOT;
        crosshairLinesEnabled = DEFAULT_CROSSHAIR_LINES;
        crosshairOutlineEnabled = DEFAULT_CROSSHAIR_OUTLINE;
        crosshairColor = DEFAULT_CROSSHAIR_COLOR;
        crosshairRotation = DEFAULT_CROSSHAIR_ROTATION;
        targetCrosshairLength = DEFAULT_TARGET_CROSSHAIR_LENGTH;
        targetCrosshairThickness = DEFAULT_TARGET_CROSSHAIR_THICKNESS;
        targetCrosshairGap = DEFAULT_TARGET_CROSSHAIR_GAP;
        targetCrosshairDotSize = DEFAULT_TARGET_CROSSHAIR_DOT_SIZE;
        targetCrosshairDotEnabled = DEFAULT_TARGET_CROSSHAIR_DOT;
        targetCrosshairLinesEnabled = DEFAULT_TARGET_CROSSHAIR_LINES;
        targetCrosshairOutlineEnabled = DEFAULT_TARGET_CROSSHAIR_OUTLINE;
        targetCrosshairColor = DEFAULT_TARGET_CROSSHAIR_COLOR;
        targetCrosshairRotation = DEFAULT_TARGET_CROSSHAIR_ROTATION;
        zoomFov = DEFAULT_ZOOM_FOV;
        zoomSmoothing = DEFAULT_ZOOM_SMOOTHING;
        motionBlurPasses = DEFAULT_MOTION_BLUR_PASSES;
        fullbrightGamma = DEFAULT_FULLBRIGHT_GAMMA;
        lowShieldYOffset = DEFAULT_LOW_SHIELD_Y;
        lowFireYOffset = DEFAULT_LOW_FIRE_Y;
        miniItemsScale = DEFAULT_MINI_ITEMS_SCALE;
        miniItemsPreset = DEFAULT_MINI_ITEMS_PRESET;
        inventoryStartDepth = DEFAULT_INVENTORY_START_DEPTH;
        inventorySpeed = DEFAULT_INVENTORY_SPEED;
        inventorySmoothing = DEFAULT_INVENTORY_SMOOTHNESS;
        inventoryEasing = DEFAULT_INVENTORY_EASING;
        chatOpacity = DEFAULT_CHAT_OPACITY;
        chatLineSpacing = DEFAULT_CHAT_LINE_SPACING;
        chatWidth = DEFAULT_CHAT_WIDTH;
        chatHeightFocused = DEFAULT_CHAT_HEIGHT_FOCUSED;
        chatHeightUnfocused = DEFAULT_CHAT_HEIGHT_UNFOCUSED;
        fpsShowLabel = DEFAULT_FPS_SHOW_LABEL;
        pingShowUnits = DEFAULT_PING_SHOW_UNITS;
        cpsShowLabels = DEFAULT_CPS_SHOW_LABELS;
        compassShowDegrees = DEFAULT_COMPASS_SHOW_DEGREES;
        directionShowDegrees = DEFAULT_DIRECTION_SHOW_DEGREES;
        coordinatesShowNetherConversion = DEFAULT_COORDINATES_SHOW_NETHER_CONVERSION;
        speedDecimals = DEFAULT_SPEED_DECIMALS;
        healthDecimals = DEFAULT_HEALTH_DECIMALS;
        biomeTitleCase = DEFAULT_BIOME_TITLE_CASE;
        blockDetectShowNamespace = DEFAULT_BLOCK_DETECT_SHOW_NAMESPACE;
        armorHorizontal = DEFAULT_ARMOR_HORIZONTAL;
        armorSpacing = DEFAULT_ARMOR_SPACING;
        armorShowDurability = DEFAULT_ARMOR_SHOW_DURABILITY;
        armorSlotStyle = DEFAULT_ARMOR_SLOT_STYLE;
        armorTextScale = DEFAULT_ARMOR_TEXT_SCALE;
        armorTextPosition = DEFAULT_ARMOR_TEXT_POSITION;
        freeLookFront = DEFAULT_FREE_LOOK_FRONT;
        noHurtCamStrength = DEFAULT_NO_HURT_CAM_STRENGTH;
        autoSprintAllowItemUse = DEFAULT_AUTO_SPRINT_ALLOW_ITEM_USE;
    }

    public static void writeTo(JsonObject root) {
        JsonObject ui = new JsonObject();
        ui.addProperty("onColor", onColor);
        ui.addProperty("offColor", offColor);
        ui.addProperty("moduleBackgroundAlpha", moduleBackgroundAlpha);
        ui.addProperty("crosshairLength", crosshairLength);
        ui.addProperty("crosshairThickness", crosshairThickness);
        ui.addProperty("crosshairGap", crosshairGap);
        ui.addProperty("crosshairDotSize", crosshairDotSize);
        ui.addProperty("crosshairDotEnabled", crosshairDotEnabled);
        ui.addProperty("crosshairLinesEnabled", crosshairLinesEnabled);
        ui.addProperty("crosshairOutlineEnabled", crosshairOutlineEnabled);
        ui.addProperty("crosshairColor", crosshairColor);
        ui.addProperty("crosshairRotation", crosshairRotation);
        ui.addProperty("targetCrosshairLength", targetCrosshairLength);
        ui.addProperty("targetCrosshairThickness", targetCrosshairThickness);
        ui.addProperty("targetCrosshairGap", targetCrosshairGap);
        ui.addProperty("targetCrosshairDotSize", targetCrosshairDotSize);
        ui.addProperty("targetCrosshairDotEnabled", targetCrosshairDotEnabled);
        ui.addProperty("targetCrosshairLinesEnabled", targetCrosshairLinesEnabled);
        ui.addProperty("targetCrosshairOutlineEnabled", targetCrosshairOutlineEnabled);
        ui.addProperty("targetCrosshairColor", targetCrosshairColor);
        ui.addProperty("targetCrosshairRotation", targetCrosshairRotation);
        ui.addProperty("zoomFov", zoomFov);
        ui.addProperty("zoomSmoothing", zoomSmoothing);
        ui.addProperty("motionBlurPasses", motionBlurPasses);
        ui.addProperty("fullbrightGamma", fullbrightGamma);
        ui.addProperty("lowShieldYOffset", lowShieldYOffset);
        ui.addProperty("lowFireYOffset", lowFireYOffset);
        ui.addProperty("miniItemsScale", miniItemsScale);
        ui.addProperty("miniItemsPreset", miniItemsPreset);
        ui.addProperty("inventoryStartDepth", inventoryStartDepth);
        ui.addProperty("inventorySpeed", inventorySpeed);
        ui.addProperty("inventorySmoothing", inventorySmoothing);
        ui.addProperty("inventoryEasing", inventoryEasing);
        ui.addProperty("chatOpacity", chatOpacity);
        ui.addProperty("chatLineSpacing", chatLineSpacing);
        ui.addProperty("chatWidth", chatWidth);
        ui.addProperty("chatHeightFocused", chatHeightFocused);
        ui.addProperty("chatHeightUnfocused", chatHeightUnfocused);
        ui.addProperty("fpsShowLabel", fpsShowLabel);
        ui.addProperty("pingShowUnits", pingShowUnits);
        ui.addProperty("cpsShowLabels", cpsShowLabels);
        ui.addProperty("compassShowDegrees", compassShowDegrees);
        ui.addProperty("directionShowDegrees", directionShowDegrees);
        ui.addProperty("coordinatesShowNetherConversion", coordinatesShowNetherConversion);
        ui.addProperty("speedDecimals", speedDecimals);
        ui.addProperty("healthDecimals", healthDecimals);
        ui.addProperty("biomeTitleCase", biomeTitleCase);
        ui.addProperty("blockDetectShowNamespace", blockDetectShowNamespace);
        ui.addProperty("armorHorizontal", armorHorizontal);
        ui.addProperty("armorSpacing", armorSpacing);
        ui.addProperty("armorShowDurability", armorShowDurability);
        ui.addProperty("armorSlotStyle", armorSlotStyle);
        ui.addProperty("armorTextScale", armorTextScale);
        ui.addProperty("armorTextPosition", armorTextPosition);
        ui.addProperty("freeLookFront", freeLookFront);
        ui.addProperty("noHurtCamStrength", noHurtCamStrength);
        ui.addProperty("autoSprintAllowItemUse", autoSprintAllowItemUse);
        root.add("ui", ui);
    }

    public static void readFrom(JsonObject root) {
        if (root == null || !root.has("ui")) {
            return;
        }
        JsonObject ui = root.getAsJsonObject("ui");
        if (ui == null) {
            return;
        }
        if (ui.has("onColor")) {
            setOnColor(ui.get("onColor").getAsInt());
        }
        if (ui.has("offColor")) {
            setOffColor(ui.get("offColor").getAsInt());
        }
        if (ui.has("moduleBackgroundAlpha")) {
            setModuleBackgroundAlpha(ui.get("moduleBackgroundAlpha").getAsInt());
        }
        if (ui.has("crosshairLength")) {
            setCrosshairLength(ui.get("crosshairLength").getAsInt());
        }
        if (ui.has("crosshairThickness")) {
            setCrosshairThickness(ui.get("crosshairThickness").getAsInt());
        }
        if (ui.has("crosshairGap")) {
            setCrosshairGap(ui.get("crosshairGap").getAsInt());
        }
        if (ui.has("crosshairDotSize")) {
            setCrosshairDotSize(ui.get("crosshairDotSize").getAsInt());
        }
        if (ui.has("crosshairDotEnabled")) {
            setCrosshairDotEnabled(ui.get("crosshairDotEnabled").getAsBoolean());
        }
        if (ui.has("crosshairLinesEnabled")) {
            setCrosshairLinesEnabled(ui.get("crosshairLinesEnabled").getAsBoolean());
        }
        if (ui.has("crosshairOutlineEnabled")) {
            setCrosshairOutlineEnabled(ui.get("crosshairOutlineEnabled").getAsBoolean());
        }
        if (ui.has("crosshairColor")) {
            setCrosshairColor(ui.get("crosshairColor").getAsInt());
        }
        if (ui.has("crosshairRotation")) {
            setCrosshairRotation(ui.get("crosshairRotation").getAsInt());
        }
        if (ui.has("targetCrosshairLength")) {
            setTargetCrosshairLength(ui.get("targetCrosshairLength").getAsInt());
        }
        if (ui.has("targetCrosshairThickness")) {
            setTargetCrosshairThickness(ui.get("targetCrosshairThickness").getAsInt());
        }
        if (ui.has("targetCrosshairGap")) {
            setTargetCrosshairGap(ui.get("targetCrosshairGap").getAsInt());
        }
        if (ui.has("targetCrosshairDotSize")) {
            setTargetCrosshairDotSize(ui.get("targetCrosshairDotSize").getAsInt());
        }
        if (ui.has("targetCrosshairDotEnabled")) {
            setTargetCrosshairDotEnabled(ui.get("targetCrosshairDotEnabled").getAsBoolean());
        }
        if (ui.has("targetCrosshairLinesEnabled")) {
            setTargetCrosshairLinesEnabled(ui.get("targetCrosshairLinesEnabled").getAsBoolean());
        }
        if (ui.has("targetCrosshairOutlineEnabled")) {
            setTargetCrosshairOutlineEnabled(ui.get("targetCrosshairOutlineEnabled").getAsBoolean());
        }
        if (ui.has("targetCrosshairColor")) {
            setTargetCrosshairColor(ui.get("targetCrosshairColor").getAsInt());
        }
        if (ui.has("targetCrosshairRotation")) {
            setTargetCrosshairRotation(ui.get("targetCrosshairRotation").getAsInt());
        }
        if (ui.has("zoomFov")) {
            setZoomFov(ui.get("zoomFov").getAsInt());
        }
        if (ui.has("zoomSmoothing")) {
            setZoomSmoothing(ui.get("zoomSmoothing").getAsDouble());
        }
        if (ui.has("motionBlurPasses")) {
            setMotionBlurPasses(ui.get("motionBlurPasses").getAsInt());
        }
        if (ui.has("fullbrightGamma")) {
            setFullbrightGamma(ui.get("fullbrightGamma").getAsInt());
        }
        if (ui.has("lowShieldYOffset")) {
            setLowShieldYOffset(ui.get("lowShieldYOffset").getAsDouble());
        }
        if (ui.has("lowFireYOffset")) {
            setLowFireYOffset(ui.get("lowFireYOffset").getAsDouble());
        }
        if (ui.has("miniItemsScale")) {
            setMiniItemsScale(ui.get("miniItemsScale").getAsDouble());
        }
        if (ui.has("miniItemsPreset")) {
            setMiniItemsPreset(ui.get("miniItemsPreset").getAsInt());
        }
        if (ui.has("inventoryStartDepth")) {
            setInventoryStartDepth(ui.get("inventoryStartDepth").getAsDouble());
        }
        if (ui.has("inventorySpeed")) {
            setInventorySpeed(ui.get("inventorySpeed").getAsDouble());
        }
        if (ui.has("inventorySmoothing")) {
            setInventorySmoothing(ui.get("inventorySmoothing").getAsDouble());
        }
        if (ui.has("inventoryEasing")) {
            setInventoryEasing(ui.get("inventoryEasing").getAsInt());
        }
        if (ui.has("chatOpacity")) {
            setChatOpacity(ui.get("chatOpacity").getAsDouble());
        }
        if (ui.has("chatLineSpacing")) {
            setChatLineSpacing(ui.get("chatLineSpacing").getAsDouble());
        }
        if (ui.has("chatWidth")) {
            setChatWidth(ui.get("chatWidth").getAsDouble());
        }
        if (ui.has("chatHeightFocused")) {
            setChatHeightFocused(ui.get("chatHeightFocused").getAsDouble());
        }
        if (ui.has("chatHeightUnfocused")) {
            setChatHeightUnfocused(ui.get("chatHeightUnfocused").getAsDouble());
        }
        if (ui.has("fpsShowLabel")) {
            setFpsShowLabel(ui.get("fpsShowLabel").getAsBoolean());
        }
        if (ui.has("pingShowUnits")) {
            setPingShowUnits(ui.get("pingShowUnits").getAsBoolean());
        }
        if (ui.has("cpsShowLabels")) {
            setCpsShowLabels(ui.get("cpsShowLabels").getAsBoolean());
        }
        if (ui.has("compassShowDegrees")) {
            setCompassShowDegrees(ui.get("compassShowDegrees").getAsBoolean());
        }
        if (ui.has("directionShowDegrees")) {
            setDirectionShowDegrees(ui.get("directionShowDegrees").getAsBoolean());
        }
        if (ui.has("coordinatesShowNetherConversion")) {
            setCoordinatesShowNetherConversion(ui.get("coordinatesShowNetherConversion").getAsBoolean());
        }
        if (ui.has("speedDecimals")) {
            setSpeedDecimals(ui.get("speedDecimals").getAsInt());
        }
        if (ui.has("healthDecimals")) {
            setHealthDecimals(ui.get("healthDecimals").getAsInt());
        }
        if (ui.has("biomeTitleCase")) {
            setBiomeTitleCase(ui.get("biomeTitleCase").getAsBoolean());
        }
        if (ui.has("blockDetectShowNamespace")) {
            setBlockDetectShowNamespace(ui.get("blockDetectShowNamespace").getAsBoolean());
        }
        if (ui.has("armorHorizontal")) {
            setArmorHorizontal(ui.get("armorHorizontal").getAsBoolean());
        }
        if (ui.has("armorSpacing")) {
            setArmorSpacing(ui.get("armorSpacing").getAsInt());
        }
        if (ui.has("armorShowDurability")) {
            setArmorShowDurability(ui.get("armorShowDurability").getAsBoolean());
        }
        if (ui.has("armorSlotStyle")) {
            setArmorSlotStyle(ui.get("armorSlotStyle").getAsBoolean());
        }
        if (ui.has("armorTextScale")) {
            setArmorTextScale(ui.get("armorTextScale").getAsInt());
        }
        if (ui.has("armorTextPosition")) {
            setArmorTextPosition(ui.get("armorTextPosition").getAsInt());
        }
        if (ui.has("freeLookFront")) {
            setFreeLookFront(ui.get("freeLookFront").getAsBoolean());
        }
        if (ui.has("noHurtCamStrength")) {
            setNoHurtCamStrength(ui.get("noHurtCamStrength").getAsInt());
        }
        if (ui.has("autoSprintAllowItemUse")) {
            setAutoSprintAllowItemUse(ui.get("autoSprintAllowItemUse").getAsBoolean());
        }
    }

    public static int getCrosshairLength() {
        return crosshairLength;
    }

    public static void setCrosshairLength(int value) {
        crosshairLength = Math.max(1, Math.min(24, value));
    }

    public static int getCrosshairThickness() {
        return crosshairThickness;
    }

    public static void setCrosshairThickness(int value) {
        crosshairThickness = Math.max(1, Math.min(10, value));
    }

    public static int getCrosshairGap() {
        return crosshairGap;
    }

    public static void setCrosshairGap(int value) {
        crosshairGap = Math.max(0, Math.min(24, value));
    }

    public static int getCrosshairDotSize() {
        return crosshairDotSize;
    }

    public static void setCrosshairDotSize(int value) {
        crosshairDotSize = Math.max(1, Math.min(10, value));
    }

    public static boolean isCrosshairDotEnabled() {
        return crosshairDotEnabled;
    }

    public static void setCrosshairDotEnabled(boolean value) {
        crosshairDotEnabled = value;
    }

    public static boolean isCrosshairLinesEnabled() {
        return crosshairLinesEnabled;
    }

    public static void setCrosshairLinesEnabled(boolean value) {
        crosshairLinesEnabled = value;
    }

    public static boolean isCrosshairOutlineEnabled() {
        return crosshairOutlineEnabled;
    }

    public static void setCrosshairOutlineEnabled(boolean value) {
        crosshairOutlineEnabled = value;
    }

    public static int getCrosshairColor() {
        return crosshairColor;
    }

    public static void setCrosshairColor(int value) {
        crosshairColor = value & 0xFFFFFF;
    }

    public static int getCrosshairRotation() {
        return crosshairRotation;
    }

    public static void setCrosshairRotation(int value) {
        crosshairRotation = Math.floorMod(value, 360);
    }

    public static int getTargetCrosshairLength() {
        return targetCrosshairLength;
    }

    public static void setTargetCrosshairLength(int value) {
        targetCrosshairLength = Math.max(1, Math.min(24, value));
    }

    public static int getTargetCrosshairThickness() {
        return targetCrosshairThickness;
    }

    public static void setTargetCrosshairThickness(int value) {
        targetCrosshairThickness = Math.max(1, Math.min(10, value));
    }

    public static int getTargetCrosshairGap() {
        return targetCrosshairGap;
    }

    public static void setTargetCrosshairGap(int value) {
        targetCrosshairGap = Math.max(0, Math.min(24, value));
    }

    public static int getTargetCrosshairDotSize() {
        return targetCrosshairDotSize;
    }

    public static void setTargetCrosshairDotSize(int value) {
        targetCrosshairDotSize = Math.max(1, Math.min(10, value));
    }

    public static boolean isTargetCrosshairDotEnabled() {
        return targetCrosshairDotEnabled;
    }

    public static void setTargetCrosshairDotEnabled(boolean value) {
        targetCrosshairDotEnabled = value;
    }

    public static boolean isTargetCrosshairLinesEnabled() {
        return targetCrosshairLinesEnabled;
    }

    public static void setTargetCrosshairLinesEnabled(boolean value) {
        targetCrosshairLinesEnabled = value;
    }

    public static boolean isTargetCrosshairOutlineEnabled() {
        return targetCrosshairOutlineEnabled;
    }

    public static void setTargetCrosshairOutlineEnabled(boolean value) {
        targetCrosshairOutlineEnabled = value;
    }

    public static int getTargetCrosshairColor() {
        return targetCrosshairColor;
    }

    public static void setTargetCrosshairColor(int value) {
        targetCrosshairColor = value & 0xFFFFFF;
    }

    public static int getTargetCrosshairRotation() {
        return targetCrosshairRotation;
    }

    public static void setTargetCrosshairRotation(int value) {
        targetCrosshairRotation = Math.floorMod(value, 360);
    }

    public static int getZoomFov() {
        return zoomFov;
    }

    public static void setZoomFov(int value) {
        zoomFov = Math.max(5, Math.min(90, value));
    }

    public static double getZoomSmoothing() {
        return zoomSmoothing;
    }

    public static void setZoomSmoothing(double value) {
        zoomSmoothing = Math.max(0.01D, Math.min(0.95D, value));
    }

    public static int getMotionBlurPasses() {
        return motionBlurPasses;
    }

    public static void setMotionBlurPasses(int value) {
        motionBlurPasses = Math.max(1, Math.min(6, value));
    }

    public static int getFullbrightGamma() {
        return fullbrightGamma;
    }

    public static void setFullbrightGamma(int value) {
        fullbrightGamma = Math.max(1, Math.min(5000, value));
    }

    public static double getLowShieldYOffset() {
        return lowShieldYOffset;
    }

    public static void setLowShieldYOffset(double value) {
        lowShieldYOffset = Math.max(-1.5D, Math.min(2.0D, value));
    }

    public static double getLowFireYOffset() {
        return lowFireYOffset;
    }

    public static void setLowFireYOffset(double value) {
        lowFireYOffset = Math.max(-1.5D, Math.min(2.0D, value));
    }

    public static double getMiniItemsScale() {
        return miniItemsScale;
    }

    public static void setMiniItemsScale(double value) {
        miniItemsScale = Math.max(0.25D, Math.min(1.25D, value));
    }

    public static int getMiniItemsPreset() {
        return miniItemsPreset;
    }

    public static void setMiniItemsPreset(int value) {
        miniItemsPreset = Math.max(0, Math.min(2, value));
    }

    public static double getInventoryStartDepth() {
        return inventoryStartDepth;
    }

    public static void setInventoryStartDepth(double value) {
        inventoryStartDepth = Math.max(0.3D, Math.min(1.0D, value));
    }

    public static double getInventorySpeed() {
        return inventorySpeed;
    }

    public static void setInventorySpeed(double value) {
        inventorySpeed = Math.max(0.5D, Math.min(20.0D, value));
    }

    public static double getInventorySmoothing() {
        return inventorySmoothing;
    }

    public static void setInventorySmoothing(double value) {
        inventorySmoothing = Math.max(0.01D, Math.min(1.0D, value));
    }

    public static int getInventoryEasing() {
        return inventoryEasing;
    }

    public static void setInventoryEasing(int value) {
        inventoryEasing = Math.max(0, Math.min(2, value));
    }

    public static double getChatOpacity() {
        return chatOpacity;
    }

    public static void setChatOpacity(double value) {
        chatOpacity = Math.max(0.1D, Math.min(1.0D, value));
    }

    public static double getChatLineSpacing() {
        return chatLineSpacing;
    }

    public static void setChatLineSpacing(double value) {
        chatLineSpacing = Math.max(0.0D, Math.min(0.7D, value));
    }

    public static double getChatWidth() {
        return chatWidth;
    }

    public static void setChatWidth(double value) {
        chatWidth = Math.max(0.3D, Math.min(1.0D, value));
    }

    public static double getChatHeightFocused() {
        return chatHeightFocused;
    }

    public static void setChatHeightFocused(double value) {
        chatHeightFocused = Math.max(0.2D, Math.min(1.0D, value));
    }

    public static double getChatHeightUnfocused() {
        return chatHeightUnfocused;
    }

    public static void setChatHeightUnfocused(double value) {
        chatHeightUnfocused = Math.max(0.2D, Math.min(1.0D, value));
    }

    public static boolean isFpsShowLabel() {
        return fpsShowLabel;
    }

    public static void setFpsShowLabel(boolean value) {
        fpsShowLabel = value;
    }

    public static boolean isPingShowUnits() {
        return pingShowUnits;
    }

    public static void setPingShowUnits(boolean value) {
        pingShowUnits = value;
    }

    public static boolean isCpsShowLabels() {
        return cpsShowLabels;
    }

    public static void setCpsShowLabels(boolean value) {
        cpsShowLabels = value;
    }

    public static boolean isCompassShowDegrees() {
        return compassShowDegrees;
    }

    public static void setCompassShowDegrees(boolean value) {
        compassShowDegrees = value;
    }

    public static boolean isDirectionShowDegrees() {
        return directionShowDegrees;
    }

    public static void setDirectionShowDegrees(boolean value) {
        directionShowDegrees = value;
    }

    public static boolean isCoordinatesShowNetherConversion() {
        return coordinatesShowNetherConversion;
    }

    public static void setCoordinatesShowNetherConversion(boolean value) {
        coordinatesShowNetherConversion = value;
    }

    public static int getSpeedDecimals() {
        return speedDecimals;
    }

    public static void setSpeedDecimals(int value) {
        speedDecimals = Math.max(0, Math.min(3, value));
    }

    public static int getHealthDecimals() {
        return healthDecimals;
    }

    public static void setHealthDecimals(int value) {
        healthDecimals = Math.max(0, Math.min(2, value));
    }

    public static boolean isBiomeTitleCase() {
        return biomeTitleCase;
    }

    public static void setBiomeTitleCase(boolean value) {
        biomeTitleCase = value;
    }

    public static boolean isBlockDetectShowNamespace() {
        return blockDetectShowNamespace;
    }

    public static void setBlockDetectShowNamespace(boolean value) {
        blockDetectShowNamespace = value;
    }

    public static boolean isArmorHorizontal() {
        return armorHorizontal;
    }

    public static void setArmorHorizontal(boolean value) {
        armorHorizontal = value;
    }

    public static int getArmorSpacing() {
        return armorSpacing;
    }

    public static void setArmorSpacing(int value) {
        armorSpacing = Math.max(18, Math.min(80, value));
    }

    public static boolean isArmorShowDurability() {
        return armorShowDurability;
    }

    public static void setArmorShowDurability(boolean value) {
        armorShowDurability = value;
    }

    public static boolean isArmorSlotStyle() {
        return armorSlotStyle;
    }

    public static void setArmorSlotStyle(boolean value) {
        armorSlotStyle = value;
    }

    public static int getArmorTextScale() {
        return armorTextScale;
    }

    public static void setArmorTextScale(int value) {
        armorTextScale = Math.max(50, Math.min(125, value));
    }

    public static int getArmorTextPosition() {
        return armorTextPosition;
    }

    public static void setArmorTextPosition(int value) {
        armorTextPosition = Math.max(0, Math.min(2, value));
    }

    public static boolean isFreeLookFront() {
        return freeLookFront;
    }

    public static void setFreeLookFront(boolean value) {
        freeLookFront = value;
    }

    public static int getNoHurtCamStrength() {
        return noHurtCamStrength;
    }

    public static void setNoHurtCamStrength(int value) {
        noHurtCamStrength = Math.max(0, Math.min(100, value));
    }

    public static boolean isAutoSprintAllowItemUse() {
        return autoSprintAllowItemUse;
    }

    public static void setAutoSprintAllowItemUse(boolean value) {
        autoSprintAllowItemUse = value;
    }
}
