package blooms_kernel;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class HudRenderer {
    private final ModuleManager moduleManager;

    public HudRenderer(ModuleManager moduleManager) {
        this.moduleManager = moduleManager;
    }

    public void render(DrawContext context, MinecraftClient client) {
        if (client.player == null || client.options.hudHidden) {
            return;
        }
        for (var module : moduleManager.getEnabledModules()) {
            if (module.isHudElement()) {
                module.render(context, client);
            }
        }
    }
}
