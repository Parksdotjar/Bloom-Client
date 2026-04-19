package blooms_kernel;

import blooms_kernel.modules.Module;
import blooms_kernel.mixin.SimpleOptionAccessor;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.Perspective;
import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import net.minecraft.item.AxeItem;
import net.minecraft.item.BlockItem;
import net.minecraft.item.BowItem;
import net.minecraft.item.CrossbowItem;
import net.minecraft.item.EnderPearlItem;
import net.minecraft.item.FishingRodItem;
import net.minecraft.item.FlintAndSteelItem;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.MaceItem;
import net.minecraft.item.Items;
import net.minecraft.item.PotionItem;
import net.minecraft.item.ShieldItem;
import net.minecraft.item.TridentItem;
import net.minecraft.util.math.MathHelper;
import net.minecraft.entity.Entity;
import net.minecraft.registry.Registries;
import net.minecraft.util.hit.EntityHitResult;
import net.minecraft.util.hit.HitResult;

public final class VisualsController {
    public static final String FULLBRIGHT = "Fullbright";
    public static final String MOTION_BLUR = "Motion Blur";
    public static final String ITEM_PHYSICS = "Item Physics";
    public static final String ZOOM = "Zoom";
    public static final String FREE_LOOK = "Free Look";
    public static final String NO_HURT_CAM = "No Hurt Cam";
    public static final String NO_PUMPKIN_OVERLAY = "No Pumpkin Overlay";
    public static final String NO_FIRE_OVERLAY = "No Fire Overlay";
    public static final String NO_WATER_BLUR = "No Water Blur";
    public static final String NO_POWDER_SNOW_OVERLAY = "No Powder Snow Overlay";
    public static final String CLEAR_GLASS = "Clear Glass";
    public static final String BETTER_CHAT = "Better Chat";
    public static final String CUSTOM_CROSSHAIR = "Custom Crosshair";
    public static final String HIT_COLOR = "Hit Color";
    public static final String NO_DAMAGE_TINT = "No Damage Tint";
    public static final String LOW_SHIELDS = "Low Shields";
    public static final String LOW_FIRE = "Low Fire";
    public static final String MINI_ITEMS = "Mini Items";
    public static final String AUTO_SPRINT = "Auto Sprint";
    public static final String INVENTORY_SCALE_UP = "Inventory Scale Up";

    private static boolean fullbrightApplied;
    private static boolean noHurtCamApplied;
    private static boolean betterChatApplied;
    private static boolean zoomApplied;
    private static boolean freeLookApplied;
    private static float freeLookYawOffset;
    private static float freeLookPitchOffset;

    private static double oldGamma;
    private static double oldDarknessEffectScale;
    private static double oldDamageTilt;
    private static int oldFov;
    private static Perspective oldPerspective;
    private static double oldChatOpacity;
    private static double oldChatLineSpacing;
    private static double oldChatWidth;
    private static double oldChatHeightFocused;
    private static double oldChatHeightUnfocused;
    private static int activeZoomBaseFov;
    private static double zoomProgress;
    private static long lastFrameTimeNanos;
    private static boolean motionBlurCameraInitialized;
    private static float lastMotionBlurYaw;
    private static float lastMotionBlurPitch;
    private static boolean motionBlurThisFrame;
    private static float motionBlurStrengthThisFrame;
    private static double inventoryScaleProgress;

    private VisualsController() {
    }

    public static void tick(MinecraftClient client) {
        if (client == null || client.options == null) {
            return;
        }
        applyFullbright(client);
        applyNoHurtCam(client);
        applyFreeLook(client);
        applyBetterChat(client);
        applyAutoSprint(client);
    }

    public static void onRenderFrame(MinecraftClient client) {
        if (client == null || client.options == null) {
            return;
        }
        long now = System.nanoTime();
        double dt = 1.0D / 60.0D;
        if (lastFrameTimeNanos != 0L) {
            dt = (now - lastFrameTimeNanos) / 1_000_000_000.0D;
        }
        lastFrameTimeNanos = now;
        if (dt < 0.0D) {
            dt = 1.0D / 60.0D;
        }
        if (dt > 0.05D) {
            dt = 0.05D;
        }
        applyZoomPerFrame(client, dt);
        updateMotionBlurForCamera(client);
        updateInventoryScale(client, dt);
    }

    public static boolean enabled(String name) {
        Module module = BloomsKernel.getModuleManager().getByName(name);
        return module != null && module.isEnabled();
    }

    public static boolean shouldHidePumpkinOverlay() {
        return enabled(NO_PUMPKIN_OVERLAY);
    }

    public static boolean shouldHideWaterOverlay() {
        return enabled(NO_WATER_BLUR);
    }

    public static boolean shouldHideFireOverlay() {
        return enabled(NO_FIRE_OVERLAY);
    }

    public static boolean shouldHidePowderSnowOverlay() {
        return enabled(NO_POWDER_SNOW_OVERLAY);
    }

    public static boolean shouldHideDamageTint() {
        return enabled(NO_DAMAGE_TINT);
    }

    public static boolean useCustomCrosshair() {
        return enabled(CUSTOM_CROSSHAIR);
    }

    public static boolean useHitColor() {
        return enabled(HIT_COLOR);
    }

    public static boolean useItemPhysics() {
        return enabled(ITEM_PHYSICS);
    }

    public static boolean useLowShields() {
        return enabled(LOW_SHIELDS);
    }

    public static boolean useLowFire() {
        return enabled(LOW_FIRE);
    }

    public static boolean useMiniItems() {
        return enabled(MINI_ITEMS);
    }

    public static double getLowShieldYOffset() {
        return KernelUiConfig.getLowShieldYOffset();
    }

    public static double getLowFireYOffset() {
        return KernelUiConfig.getLowFireYOffset();
    }

    public static double getMiniItemsScale() {
        return KernelUiConfig.getMiniItemsScale();
    }

    public static boolean shouldScaleFirstPersonItem(ItemStack stack) {
        if (!useMiniItems() || stack == null || stack.isEmpty()) {
            return false;
        }
        Item item = stack.getItem();
        return switch (KernelUiConfig.getMiniItemsPreset()) {
            case 0 -> true;
            case 2 -> isUtilityMiniItem(stack, item);
            default -> isPvpMiniItem(stack, item);
        };
    }

    private static boolean isPvpMiniItem(ItemStack stack, Item item) {
        String id = Registries.ITEM.getId(item).getPath();
        if (item instanceof AxeItem || item instanceof BowItem || item instanceof CrossbowItem
            || item instanceof ShieldItem || item instanceof FishingRodItem || item instanceof EnderPearlItem || item instanceof TridentItem
            || item instanceof PotionItem || item instanceof FlintAndSteelItem || item instanceof MaceItem) {
            return true;
        }
        if (item instanceof BlockItem blockItem) {
            return blockItem.getBlock() == Blocks.COBWEB;
        }
        return id.endsWith("_sword")
            || id.endsWith("_pickaxe")
            || id.endsWith("_shovel")
            || id.endsWith("_hoe")
            || id.endsWith("_helmet")
            || id.endsWith("_chestplate")
            || id.endsWith("_leggings")
            || id.endsWith("_boots")
            || id.contains("apple")
            || id.contains("steak")
            || id.contains("cooked_")
            || id.contains("totem")
            || id.contains("bucket")
            || id.contains("web");
    }

    private static boolean isUtilityMiniItem(ItemStack stack, Item item) {
        if (item == Items.WIND_CHARGE
            || item == Items.BREEZE_ROD
            || item == Items.ENDER_PEARL
            || item == Items.FISHING_ROD
            || item == Items.FLINT_AND_STEEL
            || item == Items.FIRE_CHARGE
            || item == Items.TNT_MINECART
            || item == Items.MILK_BUCKET
            || item == Items.WATER_BUCKET
            || item == Items.LAVA_BUCKET
            || item == Items.POWDER_SNOW_BUCKET
            || item == Items.COBWEB
            || item instanceof PotionItem) {
            return true;
        }
        if (item instanceof BlockItem blockItem) {
            return blockItem.getBlock() == Blocks.COBWEB;
        }
        String id = Registries.ITEM.getId(item).getPath();
        return id.contains("wind_charge")
            || id.contains("breeze_rod")
            || id.contains("potion")
            || id.contains("cobweb")
            || id.contains("pearl")
            || id.contains("bucket")
            || id.contains("rod")
            || id.contains("charge");
    }

    public static boolean useInventoryScaleUp() {
        return enabled(INVENTORY_SCALE_UP);
    }

    public static float getInventoryScaleFactor() {
        double eased = switch (KernelUiConfig.getInventoryEasing()) {
            case 1 -> 1.0D - Math.pow(1.0D - inventoryScaleProgress, 3.0D);
            case 2 -> {
                double t = inventoryScaleProgress;
                double c1 = 1.70158D;
                double c3 = c1 + 1.0D;
                yield 1.0D + (c3 * Math.pow(t - 1.0D, 3.0D)) + (c1 * Math.pow(t - 1.0D, 2.0D));
            }
            default -> inventoryScaleProgress * inventoryScaleProgress * (3.0D - (2.0D * inventoryScaleProgress));
        };
        double start = KernelUiConfig.getInventoryStartDepth();
        return (float) (start + ((1.0D - start) * eased));
    }

    public static boolean shouldScaleScreen(Screen screen) {
        if (!useInventoryScaleUp() || screen == null) {
            return false;
        }
        return (screen instanceof HandledScreen<?>) && !(screen instanceof ChatScreen);
    }

    public static boolean isFreeLookActive(MinecraftClient client) {
        return client != null && enabled(FREE_LOOK) && KeybindHandler.isFreeLookHeld();
    }

    public static void handleFreeLookMouse(double deltaX, double deltaY) {
        freeLookYawOffset += (float) deltaX * 0.15F;
        freeLookPitchOffset += (float) deltaY * 0.15F;
        if (freeLookPitchOffset > 85.0F) {
            freeLookPitchOffset = 85.0F;
        }
        if (freeLookPitchOffset < -85.0F) {
            freeLookPitchOffset = -85.0F;
        }
    }

    public static float getFreeLookYawOffset() {
        return freeLookYawOffset;
    }

    public static float getFreeLookPitchOffset() {
        return freeLookPitchOffset;
    }

    public static boolean hasEntityTarget(MinecraftClient client) {
        return getEntityUnderCrosshair(client) != null;
    }

    public static Entity getEntityUnderCrosshair(MinecraftClient client) {
        if (client == null || client.crosshairTarget == null || client.crosshairTarget.getType() != HitResult.Type.ENTITY) {
            return null;
        }
        EntityHitResult result = (EntityHitResult) client.crosshairTarget;
        return result.getEntity();
    }

    private static void applyFullbright(MinecraftClient client) {
        if (enabled(FULLBRIGHT)) {
            if (!fullbrightApplied) {
                oldGamma = client.options.getGamma().getValue();
                oldDarknessEffectScale = client.options.getDarknessEffectScale().getValue();
                fullbrightApplied = true;
            }
            double target = KernelUiConfig.getFullbrightGamma();
            ((SimpleOptionAccessor<Double>) (Object) client.options.getGamma()).bloomsKernel$setRawValue(target);
            client.options.getDarknessEffectScale().setValue(0.0D);
            return;
        }
        if (fullbrightApplied) {
            ((SimpleOptionAccessor<Double>) (Object) client.options.getGamma()).bloomsKernel$setRawValue(oldGamma);
            client.options.getDarknessEffectScale().setValue(oldDarknessEffectScale);
            fullbrightApplied = false;
        }
    }

    private static void applyNoHurtCam(MinecraftClient client) {
        if (enabled(NO_HURT_CAM)) {
            if (!noHurtCamApplied) {
                oldDamageTilt = client.options.getDamageTiltStrength().getValue();
                noHurtCamApplied = true;
            }
            client.options.getDamageTiltStrength().setValue(KernelUiConfig.getNoHurtCamStrength() / 100.0D);
            return;
        }
        if (noHurtCamApplied) {
            client.options.getDamageTiltStrength().setValue(oldDamageTilt);
            noHurtCamApplied = false;
        }
    }

    private static void applyZoomPerFrame(MinecraftClient client, double deltaSeconds) {
        boolean shouldZoom = enabled(ZOOM) && KeybindHandler.isZoomHeld();
        if (shouldZoom && !zoomApplied) {
            oldFov = client.options.getFov().getValue();
            activeZoomBaseFov = oldFov;
            zoomProgress = 0.0D;
            zoomApplied = true;
        }

        if (!shouldZoom && !zoomApplied) {
            return;
        }

        double speed = 2.0D + (KernelUiConfig.getZoomSmoothing() * 14.0D);
        double step = speed * deltaSeconds;
        if (shouldZoom) {
            zoomProgress = Math.min(1.0D, zoomProgress + step);
        } else {
            zoomProgress = Math.max(0.0D, zoomProgress - step);
        }

        int targetFov = Math.min(activeZoomBaseFov, KernelUiConfig.getZoomFov());
        double eased = zoomProgress * zoomProgress * (3.0D - (2.0D * zoomProgress));
        double blended = activeZoomBaseFov + ((targetFov - activeZoomBaseFov) * eased);
        client.options.getFov().setValue((int) Math.round(blended));

        if (!shouldZoom && zoomProgress <= 0.0001D) {
            client.options.getFov().setValue(oldFov);
            zoomApplied = false;
        }
    }

    private static void applyFreeLook(MinecraftClient client) {
        boolean shouldFreeLook = enabled(FREE_LOOK) && KeybindHandler.isFreeLookHeld();
        if (shouldFreeLook) {
            if (!freeLookApplied) {
                oldPerspective = client.options.getPerspective();
                freeLookYawOffset = 0.0F;
                freeLookPitchOffset = 0.0F;
                freeLookApplied = true;
            }
            client.options.setPerspective(KernelUiConfig.isFreeLookFront() ? Perspective.THIRD_PERSON_FRONT : Perspective.THIRD_PERSON_BACK);
            return;
        }
        if (freeLookApplied) {
            client.options.setPerspective(oldPerspective == null ? Perspective.FIRST_PERSON : oldPerspective);
            freeLookApplied = false;
        }
    }

    private static void applyBetterChat(MinecraftClient client) {
        if (enabled(BETTER_CHAT)) {
            if (!betterChatApplied) {
                oldChatOpacity = client.options.getChatOpacity().getValue();
                oldChatLineSpacing = client.options.getChatLineSpacing().getValue();
                oldChatWidth = client.options.getChatWidth().getValue();
                oldChatHeightFocused = client.options.getChatHeightFocused().getValue();
                oldChatHeightUnfocused = client.options.getChatHeightUnfocused().getValue();
                betterChatApplied = true;
            }
            client.options.getChatOpacity().setValue(1.0D);
            client.options.getChatLineSpacing().setValue(KernelUiConfig.getChatLineSpacing());
            client.options.getChatWidth().setValue(KernelUiConfig.getChatWidth());
            client.options.getChatHeightFocused().setValue(KernelUiConfig.getChatHeightFocused());
            client.options.getChatHeightUnfocused().setValue(KernelUiConfig.getChatHeightUnfocused());
            client.options.getChatOpacity().setValue(KernelUiConfig.getChatOpacity());
            return;
        }
        if (betterChatApplied) {
            client.options.getChatOpacity().setValue(oldChatOpacity);
            client.options.getChatLineSpacing().setValue(oldChatLineSpacing);
            client.options.getChatWidth().setValue(oldChatWidth);
            client.options.getChatHeightFocused().setValue(oldChatHeightFocused);
            client.options.getChatHeightUnfocused().setValue(oldChatHeightUnfocused);
            betterChatApplied = false;
        }
    }

    private static void applyAutoSprint(MinecraftClient client) {
        if (!enabled(AUTO_SPRINT) || client.player == null) {
            return;
        }
        if (client.options.forwardKey.isPressed()
            && !client.player.isSneaking()
            && !client.player.horizontalCollision
            && (!client.player.isUsingItem() || KernelUiConfig.isAutoSprintAllowItemUse())) {
            client.player.setSprinting(true);
        }
    }

    public static int getMotionBlurPasses() {
        int base = KernelUiConfig.getMotionBlurPasses();
        int boost = (int) Math.floor(motionBlurStrengthThisFrame * 1.6F);
        return Math.max(1, Math.min(6, base + boost));
    }

    public static boolean shouldRenderMotionBlur(MinecraftClient client) {
        if (!enabled(MOTION_BLUR) || client == null || client.player == null || client.currentScreen != null) {
            return false;
        }
        return motionBlurThisFrame;
    }

    private static void updateMotionBlurForCamera(MinecraftClient client) {
        motionBlurThisFrame = false;
        if (!enabled(MOTION_BLUR) || client.gameRenderer == null || client.player == null || client.currentScreen != null) {
            motionBlurCameraInitialized = false;
            motionBlurStrengthThisFrame = 0.0F;
            return;
        }
        float yaw = client.gameRenderer.getCamera().getYaw();
        float pitch = client.gameRenderer.getCamera().getPitch();
        if (!motionBlurCameraInitialized) {
            lastMotionBlurYaw = yaw;
            lastMotionBlurPitch = pitch;
            motionBlurCameraInitialized = true;
            return;
        }
        float yawDelta = Math.abs(MathHelper.wrapDegrees(yaw - lastMotionBlurYaw));
        float pitchDelta = Math.abs(pitch - lastMotionBlurPitch);
        lastMotionBlurYaw = yaw;
        lastMotionBlurPitch = pitch;
        motionBlurStrengthThisFrame = yawDelta + pitchDelta;
        motionBlurThisFrame = motionBlurStrengthThisFrame > 0.015F;
    }

    private static void updateInventoryScale(MinecraftClient client, double dt) {
        Screen screen = client.currentScreen;
        boolean open = shouldScaleScreen(screen);
        double target = open ? 1.0D : 0.0D;
        double speed = KernelUiConfig.getInventorySpeed();
        double smooth = KernelUiConfig.getInventorySmoothing();
        double blend = 1.0D - Math.exp(-(speed * dt));
        blend = MathHelper.clamp(blend * (0.5D + smooth), 0.0D, 1.0D);
        inventoryScaleProgress += (target - inventoryScaleProgress) * blend;
        if (Math.abs(target - inventoryScaleProgress) < 0.0005D) {
            inventoryScaleProgress = target;
        }
    }
}
