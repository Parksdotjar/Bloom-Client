package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GameRenderer.class)
public abstract class GameRendererMixin {
    @Shadow
    @Final
    private MinecraftClient client;

    @Shadow
    public abstract void renderBlur();

    @Inject(method = "renderWorld", at = @At("HEAD"))
    private void bloomsKernel$updateFrameVisuals(RenderTickCounter tickCounter, CallbackInfo ci) {
        VisualsController.onRenderFrame(client);
    }

    @Inject(method = "renderWorld", at = @At("TAIL"))
    private void bloomsKernel$motionBlur(RenderTickCounter tickCounter, CallbackInfo ci) {
        if (!VisualsController.shouldRenderMotionBlur(client)) {
            return;
        }
        int passes = VisualsController.getMotionBlurPasses();
        for (int i = 0; i < passes; i++) {
            renderBlur();
        }
    }
}
