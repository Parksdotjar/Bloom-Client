package blooms_kernel.modules;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class ToggleFeatureModule extends Module {
    public ToggleFeatureModule(String name) {
        super(name, -9999, -9999, 40, 16);
        setEnabled(false);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
    }

    @Override
    public boolean isHudElement() {
        return false;
    }
}
