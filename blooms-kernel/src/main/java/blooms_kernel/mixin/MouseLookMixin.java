package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.Mouse;
import net.minecraft.client.network.ClientPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(Mouse.class)
public abstract class MouseLookMixin {
    @Redirect(
        method = "updateMouse",
        at = @At(
            value = "INVOKE",
            target = "Lnet/minecraft/client/network/ClientPlayerEntity;changeLookDirection(DD)V"
        )
    )
    private void bloomsKernel$redirectLook(ClientPlayerEntity player, double cursorDeltaX, double cursorDeltaY) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (VisualsController.isFreeLookActive(client)) {
            VisualsController.handleFreeLookMouse(cursorDeltaX, cursorDeltaY);
            return;
        }
        player.changeLookDirection(cursorDeltaX, cursorDeltaY);
    }
}
