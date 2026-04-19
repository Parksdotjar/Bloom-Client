package blooms_kernel.mixin;

import net.minecraft.block.BlockState;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.hud.InGameOverlayRenderer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.entity.player.PlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(InGameOverlayRenderer.class)
public interface InGameOverlayRendererAccessor {
    @Invoker("renderInWallOverlay")
    static void bloomsKernel$renderInWallOverlay(Sprite sprite, MatrixStack matrices, VertexConsumerProvider vertexConsumers) {
        throw new AssertionError();
    }

    @Invoker("renderUnderwaterOverlay")
    static void bloomsKernel$renderUnderwaterOverlay(MinecraftClient client, MatrixStack matrices, VertexConsumerProvider vertexConsumers) {
        throw new AssertionError();
    }

    @Invoker("renderFireOverlay")
    static void bloomsKernel$renderFireOverlay(MatrixStack matrices, VertexConsumerProvider vertexConsumers, Sprite sprite) {
        throw new AssertionError();
    }

    @Invoker("getInWallBlockState")
    static BlockState bloomsKernel$getInWallBlockState(PlayerEntity player) {
        throw new AssertionError();
    }
}
