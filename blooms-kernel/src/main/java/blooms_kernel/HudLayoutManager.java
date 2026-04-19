package blooms_kernel;

public final class HudLayoutManager {
    private HudLayoutManager() {
    }

    public static void save(ModuleManager moduleManager) {
        moduleManager.saveConfig();
    }

    public static void load(ModuleManager moduleManager) {
        moduleManager.loadConfig();
    }
}

