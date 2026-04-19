package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class FpsModule extends Module {
    public FpsModule() {
        super("FPS", 4, 4, 65, 16);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, KernelUiConfig.isFpsShowLabel() ? "FPS: " + mc.getCurrentFps() : String.valueOf(mc.getCurrentFps()));
    }
}
