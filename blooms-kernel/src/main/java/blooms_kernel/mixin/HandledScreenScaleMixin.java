package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.ingame.HandledScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(HandledScreen.class)
public abstract class HandledScreenScaleMixin {
    @Unique
    private boolean bloomsKernel$pushedScale;

    @Shadow
    protected abstract void drawBackground(DrawContext context, float deltaTicks, int mouseX, int mouseY);

    @Inject(method = "renderMain", at = @At("HEAD"))
    private void bloomsKernel$scaleUiStart(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
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

    @Inject(method = "renderMain", at = @At("TAIL"))
    private void bloomsKernel$scaleUiEnd(DrawContext context, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        if (!bloomsKernel$pushedScale) {
            return;
        }
        context.getMatrices().popMatrix();
        bloomsKernel$pushedScale = false;
    }

    @Redirect(
        method = "renderBackground",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/gui/screen/ingame/HandledScreen;drawBackground(Lnet/minecraft/client/gui/DrawContext;FII)V"
        )
    )
    private void bloomsKernel$scaleBackgroundPanel(HandledScreen<?> instance, DrawContext context, float delta, int mouseX, int mouseY) {
        Screen self = (Screen) (Object) this;
        if (!VisualsController.shouldScaleScreen(self)) {
            drawBackground(context, delta, mouseX, mouseY);
            return;
        }
        float scale = VisualsController.getInventoryScaleFactor();
        if (Math.abs(scale - 1.0F) < 0.0001F) {
            drawBackground(context, delta, mouseX, mouseY);
            return;
        }
        float centerX = self.width / 2.0F;
        float centerY = self.height / 2.0F;
        context.getMatrices().pushMatrix();
        context.getMatrices().translate(centerX, centerY);
        context.getMatrices().scale(scale, scale);
        context.getMatrices().translate(-centerX, -centerY);
        drawBackground(context, delta, mouseX, mouseY);
        context.getMatrices().popMatrix();
    }
}
