package blooms_kernel.screen;

import blooms_kernel.BloomsKernel;
import blooms_kernel.KernelUiConfig;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;

public final class KernelConfigScreen extends Screen {
    private static final int[] ON_PRESETS = {
        0x55FF55, 0x00FFAA, 0xFFFF55, 0x55FFFF, 0xFFFFFF
    };
    private static final int[] OFF_PRESETS = {
        0xFF5555, 0xFF0000, 0xFFAA55, 0xAAAAAA, 0xFFFFFF
    };

    private final Screen parent;

    public KernelConfigScreen(Screen parent) {
        super(Text.literal("Bloom's Kernel Config"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        int centerX = width / 2;
        int y = 48;
        int buttonWidth = 220;

        addDrawableChild(ButtonWidget.builder(onColorLabel(), button -> {
            KernelUiConfig.setOnColor(nextPreset(KernelUiConfig.getOnColor(), ON_PRESETS));
            button.setMessage(onColorLabel());
            BloomsKernel.getModuleManager().saveConfig();
        }).dimensions(centerX - buttonWidth / 2, y, buttonWidth, 20).build());

        y += 24;
        addDrawableChild(ButtonWidget.builder(offColorLabel(), button -> {
            KernelUiConfig.setOffColor(nextPreset(KernelUiConfig.getOffColor(), OFF_PRESETS));
            button.setMessage(offColorLabel());
            BloomsKernel.getModuleManager().saveConfig();
        }).dimensions(centerX - buttonWidth / 2, y, buttonWidth, 20).build());

        y += 26;
        addDrawableChild(new SliderWidget(centerX - buttonWidth / 2, y, buttonWidth, 20, Text.literal("HUD Background Opacity"), KernelUiConfig.getModuleBackgroundAlpha() / 255.0D) {
            @Override
            protected void updateMessage() {
                int alpha = (int) Math.round(value * 255.0D);
                setMessage(Text.literal("HUD Background Opacity: " + alpha));
            }

            @Override
            protected void applyValue() {
                int alpha = (int) Math.round(value * 255.0D);
                KernelUiConfig.setModuleBackgroundAlpha(alpha);
                BloomsKernel.getModuleManager().saveConfig();
            }
        });

        y += 30;
        addDrawableChild(ButtonWidget.builder(Text.literal("Reset Defaults"), button -> {
            KernelUiConfig.resetDefaults();
            BloomsKernel.getModuleManager().saveConfig();
            clearAndInit();
        }).dimensions(centerX - buttonWidth / 2, y, buttonWidth, 20).build());

        y += 32;
        addDrawableChild(ButtonWidget.builder(Text.literal("Done"), button -> close())
            .dimensions(centerX - 50, y, 100, 20).build());
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        context.drawTextWithShadow(textRenderer, title, width / 2 - textRenderer.getWidth(title) / 2, 16, 0xFFFFFF);
        context.drawTextWithShadow(textRenderer, Text.literal("Click color buttons to cycle presets."), width / 2 - 95, 30, 0xAAAAAA);
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

    private Text onColorLabel() {
        return Text.literal("ON Color: #" + asHex(KernelUiConfig.getOnColor()));
    }

    private Text offColorLabel() {
        return Text.literal("OFF Color: #" + asHex(KernelUiConfig.getOffColor()));
    }

    private String asHex(int color) {
        return String.format("%06X", color & 0xFFFFFF);
    }

    private int nextPreset(int current, int[] presets) {
        int cleanCurrent = current & 0xFFFFFF;
        for (int i = 0; i < presets.length; i++) {
            if ((presets[i] & 0xFFFFFF) == cleanCurrent) {
                return presets[(i + 1) % presets.length];
            }
        }
        return presets[0];
    }
}
