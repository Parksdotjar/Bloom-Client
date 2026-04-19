package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Screen.class)
public abstract class ScreenScaleMixin {
    @Unique
    private boolean bloomsKernel$pushedScale;

    @Inject(method = "renderWithTooltip", at = @At("HEAD"))
    private void bloomsKernel$scaleScreenStart(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        Screen self = (Screen) (Object) this;
        if (!VisualsController.shouldScaleScreen(self)) {
            bloomsKernel$pushedScale = false;
            return;
        }
        float scale = VisualsController.getInventoryScaleFactor();
        if (Math.abs(scale - 1.0F) < 0.0001F) {
            bloomsKernel$pushedScale = false;
            return;
        }
        bloomsKernel$pushedScale = true;
        float centerX = self.width / 2.0F;
        float centerY = self.height / 2.0F;
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(centerX, centerY);
        context.getMatrices().scale(scale, scale);
        context.getMatrices().translate(-centerX, -centerY);
    }

    @Inject(method = "renderWithTooltip", at = @At("TAIL"))
    private void bloomsKernel$scaleScreenEnd(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        if (!bloomsKernel$pushedScale) {
            return;
        }
        context.getMatrices().popMatrix();
        bloomsKernel$pushedScale = false;
    }
}
