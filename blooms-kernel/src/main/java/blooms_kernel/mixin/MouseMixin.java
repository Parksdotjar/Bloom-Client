package blooms_kernel.mixin;

import blooms_kernel.InputTracker;
import net.minecraft.client.Mouse;
import net.minecraft.client.input.MouseInput;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Mouse.class)
public abstract class MouseMixin {
    @Inject(method = "onMouseButton", at = @At("HEAD"))
    private void bloomsKernel$onMouseButton(long window, MouseInput buttonInfo, int action, CallbackInfo ci) {
        if (action != GLFW.GLFW_PRESS) {
            return;
        }
        int button = buttonInfo.button();
        if (button == GLFW.GLFW_MOUSE_BUTTON_LEFT) {
            InputTracker.registerLeftClick();
        } else if (button == GLFW.GLFW_MOUSE_BUTTON_RIGHT) {
            InputTracker.registerRightClick();
        }
    }
}
