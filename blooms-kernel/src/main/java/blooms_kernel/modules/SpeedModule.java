package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import blooms_kernel.SpeedTracker;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class SpeedModule extends Module {
    public SpeedModule() {
        super("Speed", 4, 148, 95, 16);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, String.format("Speed: %." + KernelUiConfig.getSpeedDecimals() + "f b/s", SpeedTracker.getBlocksPerSecond()));
    }
}
