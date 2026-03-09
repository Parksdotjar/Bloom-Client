package com.bloomunit.bloommenu.client;

import com.bloomunit.bloommenu.BloomMenuMod;
import com.bloomunit.bloommenu.client.screen.BloomMenuScreen;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;

public final class BloomMenuClient implements ClientModInitializer {
    private static KeyBinding openMenuKey;

    @Override
    public void onInitializeClient() {
        openMenuKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "key." + BloomMenuMod.MOD_ID + ".open_menu",
            InputUtil.Type.KEYSYM,
            GLFW.GLFW_KEY_RIGHT_SHIFT,
            KeyBinding.Category.create(Identifier.of(BloomMenuMod.MOD_ID, "main"))
        ));
        BloomFeatureController.registerKeybindings();
        ClientTickEvents.END_CLIENT_TICK.register(BloomMenuClient::onEndTick);
    }

    private static void onEndTick(MinecraftClient client) {
        if (client == null) {
            return;
        }

        BloomFeatureController.tick(client);

        while (openMenuKey.wasPressed()) {
            if (client.currentScreen instanceof BloomMenuScreen) {
                client.setScreen(null);
            } else if (client.player != null && client.world != null) {
                client.setScreen(new BloomMenuScreen());
            }
        }
    }
}
