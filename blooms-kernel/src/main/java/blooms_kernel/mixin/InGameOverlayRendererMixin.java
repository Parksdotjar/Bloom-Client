package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.hud.InGameOverlayRenderer;
import net.minecraft.client.render.VertexConsumerProvider;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.client.texture.Sprite;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(InGameOverlayRenderer.class)
public abstract class InGameOverlayRendererMixin {
    @Shadow
    @Final
    private MinecraftClient client;

    @Redirect(
        method = "renderOverlays",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/hud/InGameOverlayRenderer;getInWallBlockState(Lnet/minecraft/entity/player/PlayerEntity;)Lnet/minecraft/block/BlockState;"
        )
    )
    private BlockState bloomsKernel$redirectInWallBlock(PlayerEntity player) {
        BlockState state = InGameOverlayRendererAccessor.bloomsKernel$getInWallBlockState(player);
        if (!VisualsController.enabled(VisualsController.CLEAR_GLASS) || state == null) {
            return state;
        }
        String blockPath = Registries.BLOCK.getId(state.getBlock()).getPath();
        if (blockPath.contains("glass")) {
            return null;
        }
        return state;
    }

    @Redirect(
        method = "renderOverlays",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/hud/InGameOverlayRenderer;renderInWallOverlay(Lnet/minecraft/client/texture/Sprite;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;)V"
        )
    )
    private void bloomsKernel$redirectInWallOverlay(Sprite sprite, MatrixStack matrices, VertexConsumerProvider vertexConsumers) {
        if (VisualsController.shouldHidePumpkinOverlay() && client.player != null) {
            ItemStack helmet = client.player.getEquippedStack(EquipmentSlot.HEAD);
            if (helmet.isOf(Blocks.CARVED_PUMPKIN.asItem())) {
                return;
            }
        }
        InGameOverlayRendererAccessor.bloomsKernel$renderInWallOverlay(sprite, matrices, vertexConsumers);
    }

    @Redirect(
        method = "renderOverlays",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/hud/InGameOverlayRenderer;renderUnderwaterOverlay(Lnet/minecraft/client/MinecraftClient;Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;)V"
        )
    )
    private void bloomsKernel$redirectUnderwaterOverlay(MinecraftClient client, MatrixStack matrices, VertexConsumerProvider vertexConsumers) {
        if (VisualsController.shouldHideWaterOverlay()) {
            return;
        }
        InGameOverlayRendererAccessor.bloomsKernel$renderUnderwaterOverlay(client, matrices, vertexConsumers);
    }

    @Redirect(
        method = "renderOverlays",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/hud/InGameOverlayRenderer;renderFireOverlay(Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;Lnet/minecraft/client/texture/Sprite;)V"
        )
    )
    private void bloomsKernel$redirectFireOverlay(MatrixStack matrices, VertexConsumerProvider vertexConsumers, Sprite sprite) {
        if (VisualsController.shouldHideFireOverlay()) {
            return;
        }
        if (VisualsController.useLowFire()) {
            float screenOffset = (float) (VisualsController.getLowFireYOffset() * client.getWindow().getScaledHeight() * 0.22D);
            matrices.push();
            matrices.translate(0.0F, screenOffset, 0.0F);
            InGameOverlayRendererAccessor.bloomsKernel$renderFireOverlay(matrices, vertexConsumers, sprite);
            matrices.pop();
            return;
        }
        InGameOverlayRendererAccessor.bloomsKernel$renderFireOverlay(matrices, vertexConsumers, sprite);
    }
}
