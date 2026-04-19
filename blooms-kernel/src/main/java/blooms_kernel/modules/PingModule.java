package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.network.PlayerListEntry;

public final class PingModule extends Module {
    private int tickCounter;
    private String cachedText = "Ping: -- ms";

    public PingModule() {
        super("Ping", 4, 64, 85, 16);
    }

    @Override
    public void tick(MinecraftClient client) {
        tickCounter++;
        if (tickCounter % 20 != 0 || client.player == null || client.getNetworkHandler() == null) {
            return;
        }
        PlayerListEntry entry = client.getNetworkHandler().getPlayerListEntry(client.player.getUuid());
        cachedText = entry == null ? "Ping: -- ms" : "Ping: " + entry.getLatency() + " ms";
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, KernelUiConfig.isPingShowUnits() ? cachedText : cachedText.replace(" ms", ""));
    }
}
