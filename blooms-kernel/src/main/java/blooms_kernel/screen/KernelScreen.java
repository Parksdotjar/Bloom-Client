package blooms_kernel.screen;

import blooms_kernel.BloomsKernel;
import blooms_kernel.KernelUiConfig;
import blooms_kernel.modules.Module;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

import java.util.ArrayList;
import java.util.List;

public final class KernelScreen extends Screen {
    private enum ModuleTab {
        PERFORMANCE("Performance"),
        PVP("PvP"),
        CASUAL("Casual"),
        VISUALS("Visuals"),
        MISC("Misc");

        private final String label;

        ModuleTab(String label) {
            this.label = label;
        }
    }

    private final Screen parent;
    private final List<ButtonWidget> moduleButtons = new ArrayList<>();
    private ModuleTab activeTab = ModuleTab.PERFORMANCE;
    private int scrollOffset;

    public KernelScreen(Screen parent) {
        super(Text.literal("Kernel Modules"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        rebuildButtons();
    }

    private void rebuildButtons() {
        clearChildren();
        moduleButtons.clear();
        addTabButtons();

        int y = 62 - scrollOffset;
        for (Module module : getModulesForActiveTab()) {
            ButtonWidget button = ButtonWidget.builder(labelFor(module), ignored -> {
                module.setEnabled(!module.isEnabled());
                BloomsKernel.getModuleManager().markEnabledStateDirty();
                BloomsKernel.getModuleManager().saveConfig();
                ignored.setMessage(labelFor(module));
            }).dimensions(width / 2 - 104, y, 184, 20).build();
            y += 24;
            moduleButtons.add(button);
            addDrawableChild(button);
            if (hasSettings(module.getName())) {
                int rowY = y - 24;
                addDrawableChild(ButtonWidget.builder(Text.literal("⚙"), settings -> {
                    if (client != null) {
                        client.setScreen(new VisualModuleSettingsScreen(this, module.getName()));
                    }
                }).dimensions(width / 2 + 84, rowY, 20, 20).build());
            }
        }

        addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button -> close())
            .dimensions(width / 2 - 50, height - 28, 100, 20).build());
    }

    private boolean hasSettings(String moduleName) {
        return moduleName.equals("FPS")
            || moduleName.equals("Ping")
            || moduleName.equals("CPS")
            || moduleName.equals("Speed")
            || moduleName.equals("Health")
            || moduleName.equals("Armor HUD")
            || moduleName.equals("Biome")
            || moduleName.equals("Block Detect")
            || moduleName.equals("Compass")
            || moduleName.equals("Coordinates")
            || moduleName.equals("Direction")
            || moduleName.equals("Custom Crosshair")
            || moduleName.equals("Zoom")
            || moduleName.equals("Better Chat")
            || moduleName.equals("Fullbright")
            || moduleName.equals("Free Look")
            || moduleName.equals("No Hurt Cam")
            || moduleName.equals("Low Shields")
            || moduleName.equals("Low Fire")
            || moduleName.equals("Mini Items")
            || moduleName.equals("Auto Sprint")
            || moduleName.equals("Inventory Scale Up");
    }

    private void addTabButtons() {
        int tabWidth = 86;
        int tabGap = 6;
        int totalWidth = (tabWidth * ModuleTab.values().length) + (tabGap * (ModuleTab.values().length - 1));
        int startX = width / 2 - (totalWidth / 2);
        int y = 34;

        int index = 0;
        for (ModuleTab tab : ModuleTab.values()) {
            final ModuleTab clickedTab = tab;
            Text label = tab == activeTab
                ? Text.literal(tab.label).formatted(Formatting.AQUA)
                : Text.literal(tab.label).formatted(Formatting.GRAY);
            addDrawableChild(ButtonWidget.builder(label, button -> {
                activeTab = clickedTab;
                scrollOffset = 0;
                rebuildButtons();
            }).dimensions(startX + (index * (tabWidth + tabGap)), y, tabWidth, 20).build());
            index++;
        }
    }

    private List<Module> getModulesForActiveTab() {
        List<Module> filtered = new ArrayList<>();
        for (Module module : BloomsKernel.getModuleManager().getModules()) {
            if (tabFor(module.getName()) == activeTab) {
                filtered.add(module);
            }
        }
        filtered.sort((left, right) -> Integer.compare(sortIndex(left.getName()), sortIndex(right.getName())));
        return filtered;
    }

    private ModuleTab tabFor(String moduleName) {
        return switch (moduleName) {
            case "FPS", "Ping", "CPS", "Speed" -> ModuleTab.PERFORMANCE;
            case "Health", "Armor HUD" -> ModuleTab.PVP;
            case "Block Detect", "Biome", "Coordinates" -> ModuleTab.CASUAL;
            case "Fullbright", "Zoom", "Free Look", "No Hurt Cam",
                 "No Pumpkin Overlay", "No Fire Overlay", "No Water Blur", "No Powder Snow Overlay",
                 "Clear Glass", "Better Chat", "Custom Crosshair", "No Damage Tint",
                 "Low Shields", "Low Fire", "Mini Items",
                 "Auto Sprint", "Inventory Scale Up" -> ModuleTab.VISUALS;
            default -> ModuleTab.MISC;
        };
    }

    private int sortIndex(String moduleName) {
        return switch (moduleName) {
            case "FPS" -> 0;
            case "Ping" -> 1;
            case "CPS" -> 2;
            case "Speed" -> 3;
            case "Health" -> 5;
            case "Armor HUD" -> 6;
            case "Block Detect" -> 10;
            case "Biome" -> 11;
            case "Coordinates" -> 12;
            case "Compass" -> 13;
            case "Direction" -> 14;
            case "Fullbright" -> 20;
            case "Zoom" -> 23;
            case "Free Look" -> 24;
            case "No Hurt Cam" -> 25;
            case "No Pumpkin Overlay" -> 26;
            case "No Fire Overlay" -> 27;
            case "No Water Blur" -> 28;
            case "No Powder Snow Overlay" -> 29;
            case "Clear Glass" -> 30;
            case "Better Chat" -> 31;
            case "Custom Crosshair" -> 32;
            case "No Damage Tint" -> 34;
            case "Low Shields" -> 37;
            case "Low Fire" -> 38;
            case "Mini Items" -> 39;
            case "Auto Sprint" -> 40;
            case "Inventory Scale Up" -> 41;
            default -> 99;
        };
    }

    private Text labelFor(Module module) {
        if (module.isEnabled()) {
            return Text.literal("[ON] ").styled(style -> style.withColor(KernelUiConfig.getOnColor()))
                .append(Text.literal(module.getName()));
        }
        return Text.literal("[OFF] ").styled(style -> style.withColor(KernelUiConfig.getOffColor()))
            .append(Text.literal(module.getName()));
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        int maxScroll = Math.max(0, (getModulesForActiveTab().size() * 24) - (height - 104));
        scrollOffset -= (int) (verticalAmount * 18);
        if (scrollOffset < 0) {
            scrollOffset = 0;
        }
        if (scrollOffset > maxScroll) {
            scrollOffset = maxScroll;
        }
        rebuildButtons();
        return true;
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        String title = "Kernel Modules - " + activeTab.label;
        context.drawTextWithShadow(textRenderer, Text.literal(title), width / 2 - (textRenderer.getWidth(title) / 2), 12, 0xFFFFFF);
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
