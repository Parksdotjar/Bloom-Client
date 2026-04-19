package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

import java.awt.Rectangle;

public abstract class Module {
    private final String name;
    private boolean enabled = false;
    private int x;
    private int y;
    private int width;
    private int height;

    protected Module(String name, int x, int y, int width, int height) {
        this.name = name;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    public String getName() {
        return name;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        if (this.enabled == enabled) {
            return;
        }
        this.enabled = enabled;
        if (enabled) {
            onEnable();
        } else {
            onDisable();
        }
    }

    public int getX() {
        return x;
    }

    public void setX(int x) {
        this.x = x;
    }

    public int getY() {
        return y;
    }

    public void setY(int y) {
        this.y = y;
    }

    public int getWidth() {
        return width;
    }

    public void setWidth(int width) {
        this.width = Math.max(40, width);
    }

    public int getHeight() {
        return height;
    }

    public void setHeight(int height) {
        this.height = Math.max(16, height);
    }

    public Rectangle getBounds() {
        return new Rectangle(x, y, width, height);
    }

    public void tick(MinecraftClient client) {
    }

    public abstract void render(DrawContext ctx, MinecraftClient mc);

    public void onEnable() {
    }

    public void onDisable() {
    }

    public boolean isHudElement() {
        return true;
    }

    protected void drawBox(DrawContext ctx, int color) {
        int alpha = (KernelUiConfig.getModuleBackgroundAlpha() & 0xFF) << 24;
        int argb = alpha | (color & 0x00FFFFFF);
        ctx.fill(x, y, x + width, y + height, argb);
    }

    protected void drawLabel(DrawContext ctx, MinecraftClient mc, String text) {
        ctx.drawTextWithShadow(mc.textRenderer, text, x + 3, y + 4, 0xFFFFFFFF);
    }
}
