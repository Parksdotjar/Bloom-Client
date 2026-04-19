package blooms_kernel.mixin;

import blooms_kernel.BloomsKernel;
import blooms_kernel.CrosshairRenderer;
import blooms_kernel.KernelUiConfig;
import blooms_kernel.VisualsController;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.entity.Entity;
import net.minecraft.util.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(InGameHud.class)
public abstract class InGameHudMixin {
    @Inject(method = "render", at = @At("TAIL"))
    private void bloomsKernel$render(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (VisualsController.useCustomCrosshair() && client.player != null && !client.options.hudHidden) {
            int centerX = client.getWindow().getScaledWidth() / 2;
            int centerY = client.getWindow().getScaledHeight() / 2;
            CrosshairRenderer.render(context, centerX, centerY, VisualsController.hasEntityTarget(client));
        }
        BloomsKernel.getHudRenderer().render(context, client);
    }

    @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
    private void bloomsKernel$cancelVanillaCrosshair(DrawContext context, RenderTickCounter tickCounter, CallbackInfo ci) {
        if (VisualsController.useCustomCrosshair()) {
            ci.cancel();
        }
    }

    @Inject(method = "renderOverlay", at = @At("HEAD"), cancellable = true)
    private void bloomsKernel$cancelPowderOverlay(DrawContext context, Identifier texture, float opacity, CallbackInfo ci) {
        if (!VisualsController.shouldHidePowderSnowOverlay()) {
            return;
        }
        if (texture != null && texture.toString().contains("powder_snow_outline")) {
            ci.cancel();
        }
    }

    @Inject(method = "renderVignetteOverlay", at = @At("HEAD"), cancellable = true)
    private void bloomsKernel$cancelVignette(DrawContext context, Entity entity, CallbackInfo ci) {
        if (VisualsController.shouldHideDamageTint()) {
            ci.cancel();
        }
    }

    @Inject(method = "renderNauseaOverlay", at = @At("HEAD"), cancellable = true)
    private void bloomsKernel$cancelNausea(DrawContext context, float nauseaStrength, CallbackInfo ci) {
        if (VisualsController.shouldHideDamageTint()) {
            ci.cancel();
        }
    }
}
