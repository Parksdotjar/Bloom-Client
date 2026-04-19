package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.registry.entry.RegistryEntry;
import net.minecraft.world.biome.Biome;

public final class BiomeModule extends Module {
    private int tickCounter;
    private String cachedText = "Biome: --";

    public BiomeModule() {
        super("Biome", 4, 228, 160, 16);
    }

    @Override
    public void tick(MinecraftClient client) {
        if (client.player == null || client.world == null) {
            return;
        }
        tickCounter++;
        if (tickCounter % 20 != 0) {
            return;
        }
        RegistryEntry<Biome> biome = client.world.getBiome(client.player.getBlockPos());
        String raw = biome.getKey().map(key -> key.getValue().getPath()).orElse("unknown");
        cachedText = "Biome: " + (KernelUiConfig.isBiomeTitleCase() ? pretty(raw) : raw);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, cachedText);
    }

    private static String pretty(String raw) {
        String[] parts = raw.split("_");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (!builder.isEmpty()) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.isEmpty() ? raw : builder.toString();
    }
}
