package blooms_kernel;

import blooms_kernel.modules.ArmorHudModule;
import blooms_kernel.modules.BiomeModule;
import blooms_kernel.modules.BlockDetectModule;
import blooms_kernel.modules.CompassModule;
import blooms_kernel.modules.CoordinatesModule;
import blooms_kernel.modules.CpsModule;
import blooms_kernel.modules.DirectionModule;
import blooms_kernel.modules.FpsModule;
import blooms_kernel.modules.HealthModule;
import blooms_kernel.modules.PingModule;
import blooms_kernel.modules.SpeedModule;
import blooms_kernel.modules.ToggleFeatureModule;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;

public final class BloomsKernel implements ClientModInitializer {
    public static final String MOD_ID = "blooms_kernel";
    private static final ModuleManager MODULE_MANAGER = new ModuleManager();
    private static final HudRenderer HUD_RENDERER = new HudRenderer(MODULE_MANAGER);

    public static ModuleManager getModuleManager() {
        return MODULE_MANAGER;
    }

    public static HudRenderer getHudRenderer() {
        return HUD_RENDERER;
    }

    @Override
    public void onInitializeClient() {
        MODULE_MANAGER.register(new CpsModule());
        MODULE_MANAGER.register(new PingModule());
        MODULE_MANAGER.register(new FpsModule());
        MODULE_MANAGER.register(new ArmorHudModule());
        MODULE_MANAGER.register(new CompassModule());
        MODULE_MANAGER.register(new SpeedModule());
        MODULE_MANAGER.register(new CoordinatesModule());
        MODULE_MANAGER.register(new HealthModule());
        MODULE_MANAGER.register(new BiomeModule());
        MODULE_MANAGER.register(new DirectionModule());
        MODULE_MANAGER.register(new BlockDetectModule());
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.FULLBRIGHT));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.ZOOM));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.FREE_LOOK));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_HURT_CAM));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_PUMPKIN_OVERLAY));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_FIRE_OVERLAY));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_WATER_BLUR));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_POWDER_SNOW_OVERLAY));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.CLEAR_GLASS));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.BETTER_CHAT));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.CUSTOM_CROSSHAIR));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.NO_DAMAGE_TINT));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.LOW_SHIELDS));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.LOW_FIRE));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.MINI_ITEMS));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.AUTO_SPRINT));
        MODULE_MANAGER.register(new ToggleFeatureModule(VisualsController.INVENTORY_SCALE_UP));

        HudLayoutManager.load(MODULE_MANAGER);
        KeybindHandler.register();

        ClientTickEvents.END_CLIENT_TICK.register(MODULE_MANAGER::tick);
        ClientTickEvents.END_CLIENT_TICK.register(VisualsController::tick);
    }
}
