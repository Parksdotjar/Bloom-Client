package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class HealthModule extends Module {
    public HealthModule() {
        super("Health", 4, 188, 105, 16);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        if (mc.player == null) {
            return;
        }
        String text = "Health: " + String.format("%." + KernelUiConfig.getHealthDecimals() + "f", mc.player.getHealth());
        setWidth(Math.max(105, mc.textRenderer.getWidth(text) + 8));
        setHeight(16);
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, text);
    }
}
