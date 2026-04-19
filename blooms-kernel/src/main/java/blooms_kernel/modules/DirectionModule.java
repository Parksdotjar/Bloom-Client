package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class DirectionModule extends Module {
    public DirectionModule() {
        super("Direction", 4, 248, 140, 16);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        if (mc.player == null) {
            return;
        }
        float yaw = mc.player.getYaw();
        drawBox(ctx, 0x66000000);
        String label = KernelUiConfig.isDirectionShowDegrees()
            ? "Facing: " + directionForYaw(yaw) + " " + (int) normalizeYaw(yaw) + "\u00B0"
            : "Facing: " + directionForYaw(yaw);
        drawLabel(ctx, mc, label);
    }

    private static float normalizeYaw(float yaw) {
        float value = yaw % 360.0f;
        if (value < 0f) value += 360.0f;
        return value;
    }

    private static String directionForYaw(float yaw) {
        float value = normalizeYaw(yaw);
        if (value >= 315 || value < 45) return "S";
        if (value < 135) return "W";
        if (value < 225) return "N";
        return "E";
    }
}
