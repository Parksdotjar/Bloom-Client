package blooms_kernel.screen;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

public final class BloomsMenuScreen extends Screen {
    private final Screen parent;

    public BloomsMenuScreen(Screen parent) {
        super(Text.literal("Bloom's Kernel"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        int centerX = width / 2;
        int centerY = height / 2;
        addDrawableChild(ButtonWidget.builder(Text.literal("Kernel"), button ->
            client.setScreen(new KernelScreen(this))
        ).dimensions(centerX - 75, centerY - 22, 150, 20).build());

        addDrawableChild(ButtonWidget.builder(Text.literal("HUD"), button ->
            client.setScreen(new HudEditorScreen(this))
        ).dimensions(centerX - 75, centerY + 4, 150, 20).build());
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        context.fill(0, 0, width, height, 0xC0101010);
    }

    @Override
    public void close() {
        if (client != null) {
            client.setScreen(parent);
        }
    }
}
