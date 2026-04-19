package blooms_kernel.modules;

import blooms_kernel.InputTracker;
import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class CpsModule extends Module {
    private long lastUpdateAt;
    private int leftCps;
    private int rightCps;
    private String cachedText = "CPS L:0 R:0";

    public CpsModule() {
        super("CPS", 4, 24, 90, 16);
    }

    @Override
    public void tick(MinecraftClient client) {
        long now = System.currentTimeMillis();
        if (now - lastUpdateAt < 1000L) {
            return;
        }
        lastUpdateAt = now;
        leftCps = InputTracker.consumeLeftClicksSinceLastSecond();
        rightCps = InputTracker.consumeRightClicksSinceLastSecond();
        cachedText = "CPS L:" + leftCps + " R:" + rightCps;
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, KernelUiConfig.isCpsShowLabels() ? cachedText : (leftCps + " | " + rightCps));
    }
}
