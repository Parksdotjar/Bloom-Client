package blooms_kernel;

import blooms_kernel.screen.BloomsMenuScreen;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import org.lwjgl.glfw.GLFW;

public final class KeybindHandler {
    private static KeyBinding openMenuKey;
    private static KeyBinding zoomKey;
    private static KeyBinding freeLookKey;

    private KeybindHandler() {
    }

    public static void register() {
        openMenuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.blooms_kernel.open_menu",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            KeyBinding.Category.MISC
        ));
        zoomKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.blooms_kernel.zoom",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_C,
            KeyBinding.Category.MISC
        ));
        freeLookKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key.blooms_kernel.free_look",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_LEFT_ALT,
            KeyBinding.Category.MISC
        ));

        ClientTickEvents.END_CLIENT_TICK.register(KeybindHandler::onTick);
    }

    private static void onTick(MinecraftClient client) {
        while (openMenuKey.wasPressed()) {
            client.setScreen(new BloomsMenuScreen(client.currentScreen));
        }
    }

    public static boolean isZoomHeld() {
        return zoomKey != null && zoomKey.isPressed();
    }

    public static boolean isFreeLookHeld() {
        return freeLookKey != null && freeLookKey.isPressed();
    }
}
