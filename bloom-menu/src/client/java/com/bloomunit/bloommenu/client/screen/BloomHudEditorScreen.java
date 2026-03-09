package com.bloomunit.bloommenu.client.screen;

import com.bloomunit.bloommenu.client.hud.BloomHudRenderer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.util.List;

public final class BloomHudEditorScreen extends Screen {
    private String selectedWidget;
    private boolean dragging;
    private boolean resizing;
    private int dragOffsetX;
    private int dragOffsetY;
    private int doneX;
    private int doneY;
    private int doneWidth;
    private int doneHeight;

    public BloomHudEditorScreen() {
        super(Text.literal("Bloom HUD Editor"));
    }

    @Override
    protected void init() {
        super.init();
        this.doneWidth = 88;
        this.doneHeight = 24;
        this.doneX = this.width - this.doneWidth - 20;
        this.doneY = 16;
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        BloomHudRenderer.renderEditor(context, selectedWidget);
        context.fill(12, 12, this.width - 12, 44, 0xB0121822);
        context.drawText(this.textRenderer, Text.literal("Edit HUD Layout"), 22, 22, 0xFFF5F7FA, false);
        context.drawText(this.textRenderer, Text.literal("Drag widgets. Drag the corner to resize. Press ESC or Done to return."), 22, 32, 0xFF9AA4B2, false);
        context.fill(doneX, doneY, doneX + doneWidth, doneY + doneHeight, 0xFF7BE6BD);
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Done"), doneX + (doneWidth / 2), doneY + 8, 0xFF081018);
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubleClick) {
        double mouseX = click.x();
        double mouseY = click.y();
        if (mouseX >= doneX && mouseX <= doneX + doneWidth && mouseY >= doneY && mouseY <= doneY + doneHeight) {
            returnToMenu();
            return true;
        }

        List<String> widgets = BloomHudRenderer.enabledWidgetIds(com.bloomunit.bloommenu.client.config.BloomConfigManager.get());
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null) {
            return super.mouseClicked(click, doubleClick);
        }

        for (int i = widgets.size() - 1; i >= 0; i--) {
            String widgetId = widgets.get(i);
            var bounds = BloomHudRenderer.resolveBounds(client, this.width, this.height, com.bloomunit.bloommenu.client.config.BloomConfigManager.get(), widgetId);
            if (!bounds.contains(mouseX, mouseY)) {
                continue;
            }
            this.selectedWidget = widgetId;
            if (bounds.inResizeHandle(mouseX, mouseY)) {
                this.resizing = true;
            } else {
                this.dragging = true;
                this.dragOffsetX = (int) mouseX - bounds.x();
                this.dragOffsetY = (int) mouseY - bounds.y();
            }
            return true;
        }

        return super.mouseClicked(click, doubleClick);
    }

    @Override
    public boolean mouseDragged(Click click, double deltaX, double deltaY) {
        if (selectedWidget == null) {
            return super.mouseDragged(click, deltaX, deltaY);
        }
        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null) {
            return true;
        }

        double mouseX = click.x();
        double mouseY = click.y();
        var bounds = BloomHudRenderer.resolveBounds(client, this.width, this.height, com.bloomunit.bloommenu.client.config.BloomConfigManager.get(), selectedWidget);
        if (dragging) {
            BloomHudRenderer.moveWidget(selectedWidget, (int) mouseX - dragOffsetX, (int) mouseY - dragOffsetY);
            return true;
        }
        if (resizing) {
            float newScale = (float) ((mouseX - bounds.x()) / Math.max(48.0, bounds.width()));
            BloomHudRenderer.resizeWidget(selectedWidget, newScale);
            return true;
        }
        return super.mouseDragged(click, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(Click click) {
        this.dragging = false;
        this.resizing = false;
        return super.mouseReleased(click);
    }

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.key() == GLFW.GLFW_KEY_ESCAPE) {
            returnToMenu();
            return true;
        }
        return super.keyPressed(input);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    private void returnToMenu() {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client != null) {
            client.setScreen(new BloomMenuScreen());
        }
    }
}
