package blooms_kernel.screen;

import blooms_kernel.BloomsKernel;
import blooms_kernel.CrosshairRenderer;
import blooms_kernel.KernelUiConfig;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;

public final class VisualModuleSettingsScreen extends Screen {
    private final Screen parent;
    private final String moduleName;
    private boolean editingTargetCrosshair;

    public VisualModuleSettingsScreen(Screen parent, String moduleName) {
        super(Text.literal(moduleName + " Settings"));
        this.parent = parent;
        this.moduleName = moduleName;
    }

    @Override
    protected void init() {
        int centerX = width / 2;
        int rowY = 44;
        int controlWidth = 260;

        switch (moduleName) {
            case "FPS" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, fpsLabel(), button -> {
                KernelUiConfig.setFpsShowLabel(!KernelUiConfig.isFpsShowLabel());
                button.setMessage(fpsLabel());
            }));
            case "Ping" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, pingLabel(), button -> {
                KernelUiConfig.setPingShowUnits(!KernelUiConfig.isPingShowUnits());
                button.setMessage(pingLabel());
            }));
            case "CPS" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, cpsLabel(), button -> {
                KernelUiConfig.setCpsShowLabels(!KernelUiConfig.isCpsShowLabels());
                button.setMessage(cpsLabel());
            }));
            case "Speed" -> addDrawableChild(intSlider(centerX, rowY, controlWidth, "Decimals", 0, 3, KernelUiConfig.getSpeedDecimals(),
                KernelUiConfig::setSpeedDecimals));
            case "Health" -> addDrawableChild(intSlider(centerX, rowY, controlWidth, "Decimals", 0, 2, KernelUiConfig.getHealthDecimals(),
                KernelUiConfig::setHealthDecimals));
            case "Armor HUD" -> {
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, armorStyleLabel(), button -> {
                    KernelUiConfig.setArmorSlotStyle(!KernelUiConfig.isArmorSlotStyle());
                    button.setMessage(armorStyleLabel());
                }));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, armorOrientationLabel(), button -> {
                    KernelUiConfig.setArmorHorizontal(!KernelUiConfig.isArmorHorizontal());
                    button.setMessage(armorOrientationLabel());
                }));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Spacing", 18, 80, KernelUiConfig.getArmorSpacing(),
                    KernelUiConfig::setArmorSpacing));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, armorDurabilityLabel(), button -> {
                    KernelUiConfig.setArmorShowDurability(!KernelUiConfig.isArmorShowDurability());
                    button.setMessage(armorDurabilityLabel());
                }));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Durability Size", 50, 125, KernelUiConfig.getArmorTextScale(),
                    KernelUiConfig::setArmorTextScale));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, armorTextPositionLabel(), button -> {
                    KernelUiConfig.setArmorTextPosition((KernelUiConfig.getArmorTextPosition() + 1) % 3);
                    button.setMessage(armorTextPositionLabel());
                }));
            }
            case "Biome" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, biomeFormatLabel(), button -> {
                KernelUiConfig.setBiomeTitleCase(!KernelUiConfig.isBiomeTitleCase());
                button.setMessage(biomeFormatLabel());
            }));
            case "Block Detect" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, blockDetectLabel(), button -> {
                KernelUiConfig.setBlockDetectShowNamespace(!KernelUiConfig.isBlockDetectShowNamespace());
                button.setMessage(blockDetectLabel());
            }));
            case "Compass" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, compassLabel(), button -> {
                KernelUiConfig.setCompassShowDegrees(!KernelUiConfig.isCompassShowDegrees());
                button.setMessage(compassLabel());
            }));
            case "Coordinates" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, coordinatesLabel(), button -> {
                KernelUiConfig.setCoordinatesShowNetherConversion(!KernelUiConfig.isCoordinatesShowNetherConversion());
                button.setMessage(coordinatesLabel());
            }));
            case "Direction" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, directionLabel(), button -> {
                KernelUiConfig.setDirectionShowDegrees(!KernelUiConfig.isDirectionShowDegrees());
                button.setMessage(directionLabel());
            }));
            case "Custom Crosshair" -> {
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, crosshairProfileLabel(), button -> {
                    editingTargetCrosshair = !editingTargetCrosshair;
                    if (client != null) {
                        client.setScreen(new VisualModuleSettingsScreen(parent, moduleName).withCrosshairProfile(editingTargetCrosshair));
                    }
                }));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Length", 1, 24, getCrosshairLength(), this::setCrosshairLength));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Thickness", 1, 10, getCrosshairThickness(), this::setCrosshairThickness));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Middle Gap", 0, 24, getCrosshairGap(), this::setCrosshairGap));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Dot Size", 1, 10, getCrosshairDotSize(), this::setCrosshairDotSize));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Red", 0, 255, getCrosshairColorComponent(16), value -> setCrosshairColorComponent(16, value)));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Green", 0, 255, getCrosshairColorComponent(8), value -> setCrosshairColorComponent(8, value)));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Blue", 0, 255, getCrosshairColorComponent(0), value -> setCrosshairColorComponent(0, value)));
                rowY += 24;
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Rotation", 0, 359, getCrosshairRotation(), this::setCrosshairRotation));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, dotLabel(), button -> {
                    setCrosshairDotEnabled(!isCrosshairDotEnabled());
                    button.setMessage(dotLabel());
                }));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, linesLabel(), button -> {
                    setCrosshairLinesEnabled(!isCrosshairLinesEnabled());
                    button.setMessage(linesLabel());
                }));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, outlineLabel(), button -> {
                    setCrosshairOutlineEnabled(!isCrosshairOutlineEnabled());
                    button.setMessage(outlineLabel());
                }));
            }
            case "Zoom" -> {
                addDrawableChild(intSlider(centerX, rowY, controlWidth, "Zoom FOV", 5, 90, KernelUiConfig.getZoomFov(), KernelUiConfig::setZoomFov));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Smoothing", 0.01D, 0.95D, KernelUiConfig.getZoomSmoothing(), KernelUiConfig::setZoomSmoothing));
            }
            case "Better Chat" -> {
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Opacity", 0.1D, 1.0D, KernelUiConfig.getChatOpacity(), KernelUiConfig::setChatOpacity));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Width", 0.3D, 1.0D, KernelUiConfig.getChatWidth(), KernelUiConfig::setChatWidth));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Focused Height", 0.2D, 1.0D, KernelUiConfig.getChatHeightFocused(), KernelUiConfig::setChatHeightFocused));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Unfocused Height", 0.2D, 1.0D, KernelUiConfig.getChatHeightUnfocused(), KernelUiConfig::setChatHeightUnfocused));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Line Spacing", 0.0D, 0.7D, KernelUiConfig.getChatLineSpacing(), KernelUiConfig::setChatLineSpacing));
            }
            case "Fullbright" -> addDrawableChild(intSlider(centerX, rowY, controlWidth, "Gamma", 1, 5000, KernelUiConfig.getFullbrightGamma(), KernelUiConfig::setFullbrightGamma));
            case "Free Look" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, freeLookLabel(), button -> {
                KernelUiConfig.setFreeLookFront(!KernelUiConfig.isFreeLookFront());
                button.setMessage(freeLookLabel());
            }));
            case "No Hurt Cam" -> addDrawableChild(intSlider(centerX, rowY, controlWidth, "Tilt Strength", 0, 100, KernelUiConfig.getNoHurtCamStrength(), KernelUiConfig::setNoHurtCamStrength));
            case "Low Shields" -> addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Shield Height", -1.5D, 2.0D, KernelUiConfig.getLowShieldYOffset(), KernelUiConfig::setLowShieldYOffset));
            case "Low Fire" -> addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Fire Height", -1.5D, 2.0D, KernelUiConfig.getLowFireYOffset(), KernelUiConfig::setLowFireYOffset));
            case "Mini Items" -> {
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Scale", 0.25D, 1.25D, KernelUiConfig.getMiniItemsScale(), KernelUiConfig::setMiniItemsScale));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, miniPresetLabel(), button -> {
                    KernelUiConfig.setMiniItemsPreset((KernelUiConfig.getMiniItemsPreset() + 1) % 3);
                    button.setMessage(miniPresetLabel());
                }));
            }
            case "Auto Sprint" -> addDrawableChild(toggleButton(centerX, rowY, controlWidth, autoSprintLabel(), button -> {
                KernelUiConfig.setAutoSprintAllowItemUse(!KernelUiConfig.isAutoSprintAllowItemUse());
                button.setMessage(autoSprintLabel());
            }));
            case "Inventory Scale Up" -> {
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Start Depth", 0.3D, 1.0D, KernelUiConfig.getInventoryStartDepth(), KernelUiConfig::setInventoryStartDepth));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Speed", 0.5D, 20.0D, KernelUiConfig.getInventorySpeed(), KernelUiConfig::setInventorySpeed));
                rowY += 24;
                addDrawableChild(doubleSlider(centerX, rowY, controlWidth, "Smoothness", 0.01D, 1.0D, KernelUiConfig.getInventorySmoothing(), KernelUiConfig::setInventorySmoothing));
                rowY += 24;
                addDrawableChild(toggleButton(centerX, rowY, controlWidth, inventoryEasingLabel(), button -> {
                    KernelUiConfig.setInventoryEasing((KernelUiConfig.getInventoryEasing() + 1) % 3);
                    button.setMessage(inventoryEasingLabel());
                }));
            }
            default -> addDrawableChild(ButtonWidget.builder(Text.literal("No settings yet"), b -> { })
                .dimensions(centerX - controlWidth / 2, rowY, controlWidth, 20).build());
        }

        addDrawableChild(ButtonWidget.builder(Text.literal("Done"), button -> close())
            .dimensions(centerX - 50, height - 32, 100, 20).build());
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        context.drawTextWithShadow(textRenderer, title, width / 2 - textRenderer.getWidth(title) / 2, 16, 0xFFFFFF);
        if (moduleName.equals("Custom Crosshair")) {
            drawCrosshairPreview(context, width / 2, height - 82);
        }
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        context.fill(0, 0, width, height, 0xC0101010);
    }

    @Override
    public void close() {
        BloomsKernel.getModuleManager().saveConfig();
        if (client != null) {
            client.setScreen(parent);
        }
    }

    private ButtonWidget toggleButton(int centerX, int y, int controlWidth, Text label, ButtonWidget.PressAction action) {
        return ButtonWidget.builder(label, button -> {
            action.onPress(button);
            BloomsKernel.getModuleManager().saveConfig();
        }).dimensions(centerX - controlWidth / 2, y, controlWidth, 20).build();
    }

    private Text fpsLabel() {
        return Text.literal("Show Label: " + onOff(KernelUiConfig.isFpsShowLabel()));
    }

    private Text pingLabel() {
        return Text.literal("Show ms Units: " + onOff(KernelUiConfig.isPingShowUnits()));
    }

    private Text cpsLabel() {
        return Text.literal("Verbose Labels: " + onOff(KernelUiConfig.isCpsShowLabels()));
    }

    private Text armorOrientationLabel() {
        return Text.literal("Orientation: " + (KernelUiConfig.isArmorHorizontal() ? "Horizontal" : "Vertical"));
    }

    private Text armorStyleLabel() {
        return Text.literal("Style: " + (KernelUiConfig.isArmorSlotStyle() ? "Hotbar Slots" : "Minimal"));
    }

    private Text armorDurabilityLabel() {
        return Text.literal("Show Durability: " + onOff(KernelUiConfig.isArmorShowDurability()));
    }

    private Text armorTextPositionLabel() {
        String value = switch (KernelUiConfig.getArmorTextPosition()) {
            case 1 -> "Inside Slots";
            case 2 -> "Hidden";
            default -> "Below Slots";
        };
        return Text.literal("Durability Position: " + value);
    }

    private Text biomeFormatLabel() {
        return Text.literal("Format: " + (KernelUiConfig.isBiomeTitleCase() ? "Pretty" : "Raw ID"));
    }

    private Text blockDetectLabel() {
        return Text.literal("Show Namespace: " + onOff(KernelUiConfig.isBlockDetectShowNamespace()));
    }

    private Text compassLabel() {
        return Text.literal("Show Degrees: " + onOff(KernelUiConfig.isCompassShowDegrees()));
    }

    private Text coordinatesLabel() {
        return Text.literal("Nether Conversion: " + onOff(KernelUiConfig.isCoordinatesShowNetherConversion()));
    }

    private Text directionLabel() {
        return Text.literal("Show Degrees: " + onOff(KernelUiConfig.isDirectionShowDegrees()));
    }

    private Text freeLookLabel() {
        return Text.literal("Perspective: " + (KernelUiConfig.isFreeLookFront() ? "Front" : "Back"));
    }

    private Text autoSprintLabel() {
        return Text.literal("Allow While Using Item: " + onOff(KernelUiConfig.isAutoSprintAllowItemUse()));
    }

    private Text dotLabel() {
        return Text.literal("Center Dot: " + onOff(isCrosshairDotEnabled()));
    }

    private Text linesLabel() {
        return Text.literal("Lines: " + onOff(isCrosshairLinesEnabled()));
    }

    private Text outlineLabel() {
        return Text.literal("Outline: " + onOff(isCrosshairOutlineEnabled()));
    }

    private Text crosshairProfileLabel() {
        return Text.literal("Editing: " + (editingTargetCrosshair ? "Target Indicator" : "Default Crosshair"));
    }

    private Text miniPresetLabel() {
        String preset = switch (KernelUiConfig.getMiniItemsPreset()) {
            case 0 -> "All Items";
            case 2 -> "Only Utilities";
            default -> "PvP Items";
        };
        return Text.literal("Preset: " + preset);
    }

    private Text inventoryEasingLabel() {
        String mode = switch (KernelUiConfig.getInventoryEasing()) {
            case 1 -> "Ease Out Cubic";
            case 2 -> "Ease Out Back";
            default -> "Smoothstep";
        };
        return Text.literal("Easing: " + mode);
    }

    private String onOff(boolean value) {
        return value ? "ON" : "OFF";
    }

    private SliderWidget intSlider(int centerX, int y, int controlWidth, String label, int min, int max, int initial, IntConsumer apply) {
        double normalized = (initial - min) / (double) (max - min);
        return new SliderWidget(centerX - controlWidth / 2, y, controlWidth, 20, Text.literal(label), normalized) {
            @Override
            protected void updateMessage() {
                int value = min + (int) Math.round(this.value * (max - min));
                setMessage(Text.literal(label + ": " + value));
            }

            @Override
            protected void applyValue() {
                int value = min + (int) Math.round(this.value * (max - min));
                apply.accept(value);
                BloomsKernel.getModuleManager().saveConfig();
            }
        };
    }

    private SliderWidget doubleSlider(int centerX, int y, int controlWidth, String label, double min, double max, double initial, DoubleConsumer apply) {
        double normalized = (initial - min) / (max - min);
        return new SliderWidget(centerX - controlWidth / 2, y, controlWidth, 20, Text.literal(label), normalized) {
            @Override
            protected void updateMessage() {
                double value = min + (this.value * (max - min));
                setMessage(Text.literal(label + ": " + String.format("%.2f", value)));
            }

            @Override
            protected void applyValue() {
                double value = min + (this.value * (max - min));
                apply.accept(value);
                BloomsKernel.getModuleManager().saveConfig();
            }
        };
    }

    private void drawCrosshairPreview(DrawContext context, int cx, int cy) {
        String label = editingTargetCrosshair ? "Preview: Target Indicator" : "Preview: Default Crosshair";
        context.drawTextWithShadow(textRenderer, label, cx - (textRenderer.getWidth(label) / 2), cy - 28, 0xAAAAAA);
        CrosshairRenderer.render(context, cx, cy, editingTargetCrosshair);
    }

    private VisualModuleSettingsScreen withCrosshairProfile(boolean targetProfile) {
        this.editingTargetCrosshair = targetProfile;
        return this;
    }

    private int getCrosshairLength() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairLength() : KernelUiConfig.getCrosshairLength();
    }

    private void setCrosshairLength(int value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairLength(value);
        } else {
            KernelUiConfig.setCrosshairLength(value);
        }
    }

    private int getCrosshairThickness() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairThickness() : KernelUiConfig.getCrosshairThickness();
    }

    private void setCrosshairThickness(int value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairThickness(value);
        } else {
            KernelUiConfig.setCrosshairThickness(value);
        }
    }

    private int getCrosshairGap() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairGap() : KernelUiConfig.getCrosshairGap();
    }

    private void setCrosshairGap(int value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairGap(value);
        } else {
            KernelUiConfig.setCrosshairGap(value);
        }
    }

    private int getCrosshairDotSize() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairDotSize() : KernelUiConfig.getCrosshairDotSize();
    }

    private void setCrosshairDotSize(int value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairDotSize(value);
        } else {
            KernelUiConfig.setCrosshairDotSize(value);
        }
    }

    private boolean isCrosshairDotEnabled() {
        return editingTargetCrosshair ? KernelUiConfig.isTargetCrosshairDotEnabled() : KernelUiConfig.isCrosshairDotEnabled();
    }

    private void setCrosshairDotEnabled(boolean value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairDotEnabled(value);
        } else {
            KernelUiConfig.setCrosshairDotEnabled(value);
        }
    }

    private boolean isCrosshairLinesEnabled() {
        return editingTargetCrosshair ? KernelUiConfig.isTargetCrosshairLinesEnabled() : KernelUiConfig.isCrosshairLinesEnabled();
    }

    private void setCrosshairLinesEnabled(boolean value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairLinesEnabled(value);
        } else {
            KernelUiConfig.setCrosshairLinesEnabled(value);
        }
    }

    private boolean isCrosshairOutlineEnabled() {
        return editingTargetCrosshair ? KernelUiConfig.isTargetCrosshairOutlineEnabled() : KernelUiConfig.isCrosshairOutlineEnabled();
    }

    private void setCrosshairOutlineEnabled(boolean value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairOutlineEnabled(value);
        } else {
            KernelUiConfig.setCrosshairOutlineEnabled(value);
        }
    }

    private int getCrosshairRotation() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairRotation() : KernelUiConfig.getCrosshairRotation();
    }

    private void setCrosshairRotation(int value) {
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairRotation(value);
        } else {
            KernelUiConfig.setCrosshairRotation(value);
        }
    }

    private int getCrosshairColor() {
        return editingTargetCrosshair ? KernelUiConfig.getTargetCrosshairColor() : KernelUiConfig.getCrosshairColor();
    }

    private int getCrosshairColorComponent(int shift) {
        return (getCrosshairColor() >> shift) & 0xFF;
    }

    private void setCrosshairColorComponent(int shift, int value) {
        int color = getCrosshairColor();
        int next = (color & ~(0xFF << shift)) | ((value & 0xFF) << shift);
        if (editingTargetCrosshair) {
            KernelUiConfig.setTargetCrosshairColor(next);
        } else {
            KernelUiConfig.setCrosshairColor(next);
        }
    }

    @FunctionalInterface
    private interface IntConsumer {
        void accept(int value);
    }

    @FunctionalInterface
    private interface DoubleConsumer {
        void accept(double value);
    }
}
