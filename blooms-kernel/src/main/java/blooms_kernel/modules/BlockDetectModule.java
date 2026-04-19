package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.registry.Registries;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;

public final class BlockDetectModule extends Module {
    private int tickCounter;
    private String cachedText = "Block: --";

    public BlockDetectModule() {
        super("Block Detect", 4, 288, 170, 16);
    }

    @Override
    public void tick(MinecraftClient client) {
        tickCounter++;
        if (tickCounter % 4 != 0 || client.world == null) {
            return;
        }

        HitResult hit = client.crosshairTarget;
        if (!(hit instanceof BlockHitResult blockHit)) {
            cachedText = "Block: --";
            return;
        }

        BlockState state = client.world.getBlockState(blockHit.getBlockPos());
        var id = Registries.BLOCK.getId(state.getBlock());
        cachedText = "Block: " + (KernelUiConfig.isBlockDetectShowNamespace() ? id.toString() : id.getPath());
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        drawBox(ctx, 0x66000000);
        drawLabel(ctx, mc, cachedText);
    }
}
