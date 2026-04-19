package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

public final class CoordinatesModule extends Module {
    private boolean netherConversion;

    public CoordinatesModule() {
        super("Coordinates", 4, 168, 200, 16);
    }

    @Override
    public void tick(MinecraftClient client) {
        if (client.player != null && client.world != null) {
            netherConversion = client.world.getRegistryKey().getValue().toString().contains("the_nether");
        }
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        if (mc.player == null) {
            return;
        }
        int x = (int) mc.player.getX();
        int y = (int) mc.player.getY();
        int z = (int) mc.player.getZ();
        drawBox(ctx, 0x66000000);
        if (KernelUiConfig.isCoordinatesShowNetherConversion() && netherConversion) {
            drawLabel(ctx, mc, "XYZ: " + x + " " + y + " " + z + " | OW: " + (x * 8) + " " + (z * 8));
        } else if (KernelUiConfig.isCoordinatesShowNetherConversion()) {
            drawLabel(ctx, mc, "XYZ: " + x + " " + y + " " + z + " | N: " + (x / 8) + " " + (z / 8));
        } else {
            drawLabel(ctx, mc, "XYZ: " + x + " " + y + " " + z);
        }
    }
}
