package com.bloomunit.bloommenu.client.screen;

import com.bloomunit.bloommenu.BloomMenuMod;
import com.bloomunit.bloommenu.client.config.BloomConfig;
import com.bloomunit.bloommenu.client.config.BloomConfigManager;
import com.bloomunit.bloommenu.client.hud.BloomHudRenderer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.client.input.CharInput;
import net.minecraft.client.input.KeyInput;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class BloomMenuScreen extends Screen {
    private static final Identifier LOGO_TEXTURE = Identifier.of(BloomMenuMod.MOD_ID, "textures/gui/bloom_logo.png");

    private static final int BACKDROP = 0xB0000000;
    private static final int TEXT_MAIN = 0xFFF5F7FA;
    private static final int TEXT_MUTED = 0xFF8F9AAF;
    private static final int TEXT_DARK = 0xFF081018;

    private final List<Section> sections = List.of(
        new Section("mods", "FPS Boost")
    );
    private final List<Category> moduleCategories = List.of(
        new Category("All", "All")
    );
    private final List<FeatureCard> modules = new ArrayList<>();
    private final List<OptionCard> cosmetics = new ArrayList<>();
    private final List<PresetCard> presets = new ArrayList<>();
    private final List<HubAction> hubActions = List.of(
        new HubAction("settings", "Bloom Settings", true),
        new HubAction("social", "Coming Soon", false),
        new HubAction("wardrobe", "Coming Soon", false),
        new HubAction("extras", "Coming Soon", false)
    );

    private TextFieldWidget searchField;
    private Section selectedSection;
    private Category selectedCategory;
    private boolean showHub = false;

    private int shellX;
    private int shellY;
    private int shellWidth;
    private int shellHeight;
    private int sectionRowX;
    private int sectionRowY;
    private int sectionButtonHeight;
    private int searchX;
    private int searchY;
    private int searchWidth;
    private int searchHeight;
    private int searchFrameX;
    private int searchFrameY;
    private int searchFrameWidth;
    private int searchFrameHeight;
    private int viewportX;
    private int viewportY;
    private int viewportWidth;
    private int viewportHeight;
    private int scrollOffset;
    private int maxScroll;
    private float menuScale = 1.0F;

    public BloomMenuScreen() {
        super(Text.literal("Bloom FPS Boost"));
        this.selectedSection = sections.getFirst();
        this.selectedCategory = moduleCategories.getFirst();
        seedContent();
    }

    @Override
    protected void init() {
        super.init();
        this.menuScale = this.width <= 980 ? 0.84F : this.width <= 1180 ? 0.9F : 1.0F;
        int virtualWidth = Math.round(this.width / this.menuScale);
        int virtualHeight = Math.round(this.height / this.menuScale);

        this.shellWidth = Math.min(1120, virtualWidth - 72);
        this.shellHeight = Math.min(700, virtualHeight - 72);
        this.shellX = (virtualWidth - this.shellWidth) / 2;
        this.shellY = (virtualHeight - this.shellHeight) / 2;

        this.sectionRowX = shellX + 28;
        this.sectionRowY = shellY + 28;
        this.sectionButtonHeight = 26;

        this.searchFrameWidth = Math.max(220, Math.min(300, this.shellWidth / 4 + 20));
        this.searchFrameHeight = 26;
        this.searchFrameX = shellX + shellWidth - searchFrameWidth - 28;
        this.searchFrameY = this.sectionRowY;
        this.searchWidth = searchFrameWidth - 20;
        this.searchHeight = 16;
        this.searchX = searchFrameX + 10;
        this.searchY = searchFrameY + 8;
        this.searchField = null;

        this.viewportX = shellX + 24;
        this.viewportY = shellY + 68;
        this.viewportWidth = shellWidth - 48;
        this.viewportHeight = shellHeight - 92;
        clampScroll();
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        int scaledMouseX = Math.round(mouseX / this.menuScale);
        int scaledMouseY = Math.round(mouseY / this.menuScale);
        Palette palette = Palette.resolve(BloomConfigManager.get());
        context.getMatrices().pushMatrix();
        context.getMatrices().scale(this.menuScale, this.menuScale);
        drawBackdrop(context, palette);
        if (showHub) {
            drawHub(context, palette, scaledMouseX, scaledMouseY);
        } else {
            drawShell(context, palette);
            drawTopBar(context, palette, scaledMouseX, scaledMouseY);
            drawViewport(context, palette, scaledMouseX, scaledMouseY);
            if (this.searchField != null) {
                this.searchField.render(context, scaledMouseX, scaledMouseY, delta);
            }
        }
        context.getMatrices().popMatrix();
    }

    private void drawBackdrop(DrawContext context, Palette palette) {
        int virtualWidth = Math.round(this.width / this.menuScale);
        int virtualHeight = Math.round(this.height / this.menuScale);
        context.fill(0, 0, virtualWidth, virtualHeight, BACKDROP);
        context.fill(0, 0, virtualWidth, virtualHeight / 3, 0x12000000);
        context.fill(0, virtualHeight / 3, virtualWidth, virtualHeight, 0x24000000);
        context.fill(virtualWidth / 6, virtualHeight / 8, (virtualWidth / 6) * 5, (virtualHeight / 8) * 7, palette.backdropGlow);
    }

    private void drawShell(DrawContext context, Palette palette) {
        fillRoundedPanel(context, shellX, shellY, shellWidth, shellHeight, palette.shellFill, palette.borderStrong);
        fillRoundedPanel(context, shellX + 20, shellY + 24, shellWidth - 40, 34, palette.panelFill, palette.borderSoft);
        fillRoundedPanel(context, viewportX, viewportY, viewportWidth, viewportHeight, palette.panelFill, palette.borderStrong);
    }

    private void drawHub(DrawContext context, Palette palette, int mouseX, int mouseY) {
        int cardWidth = 260;
        int cardHeight = 60;
        int iconSize = 34;
        int hubY = shellY + 170;
        int centerX = shellX + (shellWidth / 2);
        int logoSize = 44;
        int logoX = centerX - (logoSize / 2);
        int logoY = hubY - 66;

        context.fill(shellX, shellY, shellX + shellWidth, shellY + shellHeight, 0x20000000);
        drawLogoBox(context, logoX, logoY, logoSize, logoSize, palette);

        boolean hoverSettings = isInside(mouseX, mouseY, centerX - (cardWidth / 2), hubY, cardWidth, cardHeight);
        fillRoundedPanel(context, centerX - (cardWidth / 2), hubY, cardWidth, cardHeight, hoverSettings ? palette.panelHoverFill : palette.panelAltFill, hoverSettings ? palette.accentBright : palette.borderSoft);
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("BLOOM SETTINGS"), centerX, hubY + 23, TEXT_MAIN);

        int rowY = hubY + 72;
        int startX = centerX - (((iconSize + 12) * hubActions.size()) / 2) + 6;
        for (int i = 0; i < hubActions.size(); i++) {
            HubAction action = hubActions.get(i);
            int x = startX + (i * (iconSize + 12));
            boolean hovered = isInside(mouseX, mouseY, x, rowY, iconSize, iconSize);
            fillRoundedPanel(context, x, rowY, iconSize, iconSize, hovered ? palette.panelHoverFill : palette.panelAltFill, action.active() ? palette.borderStrong : palette.borderSoft);
            if (action.active()) {
                drawSectionGlyph(context, x + 17, rowY + 17, 0, hovered ? palette.accentBright : TEXT_MAIN);
            } else {
                context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("?"), x + (iconSize / 2), rowY + 12, hovered ? palette.accentBright : TEXT_MUTED);
            }
        }

        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Bloom hub"), centerX, rowY + 52, TEXT_MAIN);
        context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("More sections are coming. Open settings to configure HUD, themes, and layout."), centerX, rowY + 66, TEXT_MUTED);
    }

    private void drawTopBar(DrawContext context, Palette palette, int mouseX, int mouseY) {
        for (int i = 0; i < sections.size(); i++) {
            Section section = sections.get(i);
            int buttonWidth = sectionButtonWidth(i);
            int x = sectionButtonX(i);
            boolean active = section == selectedSection;
            boolean hovered = isInside(mouseX, mouseY, x, sectionRowY, buttonWidth, sectionButtonHeight);
            fillRoundedPanel(context, x, sectionRowY, buttonWidth, sectionButtonHeight, active ? palette.accent : hovered ? palette.panelHoverFill : palette.panelAltFill, active ? palette.accent : hovered ? palette.accentBright : palette.borderSoft);
            drawSectionGlyph(context, x + 16, sectionRowY + 13, i, active ? TEXT_MAIN : hovered ? TEXT_MAIN : TEXT_MUTED);
            context.drawText(this.textRenderer, Text.literal(section.label()), x + 30, sectionRowY + 9, active ? TEXT_MAIN : hovered ? TEXT_MAIN : TEXT_MUTED, false);
        }
    }

    private void drawViewport(DrawContext context, Palette palette, int mouseX, int mouseY) {
        int contentTop = viewportY + 14 - scrollOffset;
        int gridX = viewportX + 18;
        int gridWidth = viewportWidth - 40;

        context.enableScissor(
            viewportX + 1,
            viewportY + 1,
            viewportX + viewportWidth - 1,
            viewportY + viewportHeight - 1
        );
        if (selectedSection.key().equals("mods")) {
            drawModuleCards(context, palette, mouseX, mouseY, gridX, contentTop, gridWidth);
        } else if (selectedSection.key().equals("looks")) {
            drawCosmeticCards(context, palette, mouseX, mouseY, gridX, contentTop, gridWidth);
        } else {
            drawPresetCards(context, palette, mouseX, mouseY, gridX, contentTop, gridWidth);
        }
        context.disableScissor();
        drawScrollbar(context, palette);
    }

    private void drawModuleCards(DrawContext context, Palette palette, int mouseX, int mouseY, int gridX, int startY, int gridWidth) {
        List<FeatureCard> visible = filteredModules();
        int gap = 14;
        int columns = gridWidth >= 900 ? 4 : gridWidth >= 680 ? 3 : gridWidth >= 460 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 126;

        for (int i = 0; i < visible.size(); i++) {
            FeatureCard card = visible.get(i);
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            boolean hovered = isInside(mouseX, mouseY, x, y, cardWidth, cardHeight);
            boolean enabled = card.enabled();

            fillRoundedPanel(context, x, y, cardWidth, cardHeight, hovered ? palette.panelHoverFill : palette.panelAltFill, hovered ? palette.accentBright : palette.borderSoft);
            context.fill(x + 1, y + 1, x + cardWidth - 1, y + 30, 0x18000000);
            context.fill(x + cardWidth - 24, y + 8, x + cardWidth - 12, y + 20, 0x26000000);
            drawModuleIcon(context, x + 14, y + 36, card.id(), enabled ? palette.accentBright : TEXT_MUTED);
            context.drawText(this.textRenderer, Text.literal(ellipsize(card.name(), cardWidth - 54)), x + 38, y + 22, TEXT_MAIN, false);
            drawWrappedLine(context, Text.literal(card.description()), x + 38, y + 40, cardWidth - 54, TEXT_MUTED);

            int toggleY = y + cardHeight - 24;
            if (card.implemented()) {
                fillRoundedPanel(context, x + 10, toggleY, cardWidth - 20, 16, enabled ? palette.success : palette.panelSoftFill, enabled ? palette.success : palette.borderSoft);
                context.drawCenteredTextWithShadow(this.textRenderer, Text.literal(enabled ? "Enabled" : "Disabled"), x + (cardWidth / 2), toggleY + 4, enabled ? TEXT_DARK : TEXT_MUTED);
            } else {
                fillRoundedPanel(context, x + 10, toggleY, cardWidth - 20, 16, palette.panelSoftFill, palette.borderSoft);
                context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Coming soon"), x + (cardWidth / 2), toggleY + 4, TEXT_MUTED);
                context.drawText(this.textRenderer, Text.literal("?"), x + cardWidth - 19, y + 11, palette.accentBright, false);
            }
        }

        int rows = (visible.size() + columns - 1) / columns;
        this.maxScroll = Math.max(0, rows * (cardHeight + gap) - gap - (viewportHeight - 60));
    }

    private void drawCosmeticCards(DrawContext context, Palette palette, int mouseX, int mouseY, int gridX, int startY, int gridWidth) {
        List<OptionCard> visible = filteredCosmetics();
        int gap = 14;
        int columns = gridWidth >= 760 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 170;

        for (int i = 0; i < visible.size(); i++) {
            OptionCard card = visible.get(i);
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            boolean hovered = isInside(mouseX, mouseY, x, y, cardWidth, cardHeight);

            fillRoundedPanel(context, x, y, cardWidth, cardHeight, hovered ? palette.panelHoverFill : palette.panelAltFill, hovered ? palette.accentBright : palette.borderSoft);
            drawCosmeticIcon(context, x + 22, y + 46, card.id(), palette.accentBright);
            context.drawText(this.textRenderer, Text.literal(card.name()), x + 48, y + 26, TEXT_MAIN, false);
            context.drawText(this.textRenderer, Text.literal(card.description()), x + 48, y + 46, TEXT_MUTED, false);

            int optionX = x + 16;
            for (String option : card.options()) {
                int optionWidth = Math.max(60, this.textRenderer.getWidth(optionLabel(option)) + 22);
                boolean selected = option.equals(card.currentValue());
                fillRoundedPanel(context, optionX, y + 124, optionWidth, 22, selected ? palette.accentPanel : palette.panelSoftFill, selected ? palette.accent : palette.borderSoft);
                context.drawCenteredTextWithShadow(this.textRenderer, Text.literal(optionLabel(option)), optionX + (optionWidth / 2), y + 131, selected ? TEXT_MAIN : TEXT_MUTED);
                optionX += optionWidth + 8;
            }
        }

        int rows = (visible.size() + columns - 1) / columns;
        this.maxScroll = Math.max(0, rows * (cardHeight + gap) - gap - (viewportHeight - 58));
    }

    private void drawPresetCards(DrawContext context, Palette palette, int mouseX, int mouseY, int gridX, int startY, int gridWidth) {
        int gap = 14;
        int columns = gridWidth >= 760 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 178;

        for (int i = 0; i < presets.size(); i++) {
            PresetCard card = presets.get(i);
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            boolean hovered = isInside(mouseX, mouseY, x, y, cardWidth, cardHeight);
            boolean hoveredApply = isInside(mouseX, mouseY, x + 16, y + 136, cardWidth - 32, 24);

            fillRoundedPanel(context, x, y, cardWidth, cardHeight, hovered ? palette.panelHoverFill : palette.panelAltFill, hovered ? palette.accentBright : palette.borderSoft);
            context.drawText(this.textRenderer, Text.literal(card.icon()), x + 18, y + 18, palette.accentBright, false);
            context.drawText(this.textRenderer, Text.literal(card.name()), x + 18, y + 44, TEXT_MAIN, false);
            context.drawText(this.textRenderer, Text.literal(card.description()), x + 18, y + 68, TEXT_MUTED, false);
            fillRoundedPanel(context, x + 16, y + 136, cardWidth - 32, 24, hoveredApply ? palette.accent : palette.accentPanel, hoveredApply ? palette.accentBright : palette.accent);
            context.drawCenteredTextWithShadow(this.textRenderer, Text.literal("Apply preset"), x + (cardWidth / 2), y + 144, hoveredApply ? TEXT_DARK : TEXT_MAIN);
        }

        int rows = (presets.size() + columns - 1) / columns;
        this.maxScroll = Math.max(0, rows * (cardHeight + gap) - gap - (viewportHeight - 58));
    }

    private void drawScrollbar(DrawContext context, Palette palette) {
        if (maxScroll <= 0) {
            return;
        }

        int trackX = viewportX + viewportWidth - 10;
        int trackY = viewportY + 12;
        int trackHeight = viewportHeight - 24;
        int thumbHeight = Math.max(36, (int) ((trackHeight * (double) trackHeight) / (trackHeight + maxScroll)));
        int thumbTravel = trackHeight - thumbHeight;
        int thumbY = trackY + (thumbTravel == 0 ? 0 : (int) ((scrollOffset / (double) maxScroll) * thumbTravel));

        context.fill(trackX, trackY, trackX + 3, trackY + trackHeight, 0x22000000);
        fillRoundedPanel(context, trackX - 2, thumbY, 7, thumbHeight, palette.accentPanel, palette.accent);
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubleClick) {
        double mouseX = click.x() / this.menuScale;
        double mouseY = click.y() / this.menuScale;

        if (showHub) {
            return handleHubClick(mouseX, mouseY);
        }

        for (int i = 0; i < sections.size(); i++) {
            int buttonWidth = sectionButtonWidth(i);
            int x = sectionButtonX(i);
            if (isInside(mouseX, mouseY, x, sectionRowY, buttonWidth, sectionButtonHeight)) {
                this.selectedSection = sections.get(i);
                this.selectedCategory = activeCategories().getFirst();
                clampScrollToTop();
                return true;
            }
        }

        if (selectedSection.key().equals("mods")) {
            handleModuleClick(mouseX, mouseY);
            return true;
        }
        if (selectedSection.key().equals("looks")) {
            handleCosmeticClick(mouseX, mouseY);
            return true;
        }
        handlePresetClick(mouseX, mouseY);
        return true;
    }

    private boolean handleHubClick(double mouseX, double mouseY) {
        int cardWidth = 260;
        int cardHeight = 60;
        int iconSize = 34;
        int hubY = shellY + 170;
        int centerX = shellX + (shellWidth / 2);

        if (isInside(mouseX, mouseY, centerX - (cardWidth / 2), hubY, cardWidth, cardHeight)) {
            this.showHub = false;
            return true;
        }

        int rowY = hubY + 72;
        int startX = centerX - (((iconSize + 12) * hubActions.size()) / 2) + 6;
        for (int i = 0; i < hubActions.size(); i++) {
            HubAction action = hubActions.get(i);
            int x = startX + (i * (iconSize + 12));
            if (!isInside(mouseX, mouseY, x, rowY, iconSize, iconSize)) {
                continue;
            }
            if (action.active()) {
                this.showHub = false;
            }
            return true;
        }

        return true;
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        mouseX /= this.menuScale;
        mouseY /= this.menuScale;
        if (!isInside(mouseX, mouseY, viewportX, viewportY, viewportWidth, viewportHeight) || maxScroll <= 0) {
            return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
        }
        this.scrollOffset = (int) Math.max(0, Math.min(maxScroll, scrollOffset - (verticalAmount * 28)));
        return true;
    }

    private void handleModuleClick(double mouseX, double mouseY) {
        List<FeatureCard> visible = filteredModules();
        int gap = 14;
        int gridX = viewportX + 18;
        int gridWidth = viewportWidth - 40;
        int columns = gridWidth >= 900 ? 4 : gridWidth >= 680 ? 3 : gridWidth >= 460 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 126;
        int startY = viewportY + 18 - scrollOffset;

        for (int i = 0; i < visible.size(); i++) {
            FeatureCard card = visible.get(i);
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            if (isInside(mouseX, mouseY, x, y, cardWidth, cardHeight)) {
                if (card.implemented()) {
                    toggleFeature(card.id());
                }
                return;
            }
        }
    }

    private void handleCosmeticClick(double mouseX, double mouseY) {
        List<OptionCard> visible = filteredCosmetics();
        int gap = 14;
        int gridX = viewportX + 18;
        int gridWidth = viewportWidth - 40;
        int columns = gridWidth >= 760 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 170;
        int startY = viewportY + 46 - scrollOffset;

        for (int i = 0; i < visible.size(); i++) {
            OptionCard card = visible.get(i);
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            int optionX = x + 16;
            for (String option : card.options()) {
                int optionWidth = Math.max(60, this.textRenderer.getWidth(optionLabel(option)) + 22);
                if (isInside(mouseX, mouseY, optionX, y + 124, optionWidth, 22)) {
                    if ("editHudLayout".equals(card.id())) {
                        MinecraftClient.getInstance().setScreen(new BloomHudEditorScreen());
                        return;
                    }
                    setOption(card.id(), option);
                    return;
                }
                optionX += optionWidth + 8;
            }
        }
    }

    private void handlePresetClick(double mouseX, double mouseY) {
        int gap = 14;
        int gridX = viewportX + 18;
        int gridWidth = viewportWidth - 40;
        int columns = gridWidth >= 760 ? 2 : 1;
        int cardWidth = (gridWidth - (gap * (columns - 1))) / columns;
        int cardHeight = 178;
        int startY = viewportY + 46 - scrollOffset;

        for (int i = 0; i < presets.size(); i++) {
            int col = i % columns;
            int row = i / columns;
            int x = gridX + (col * (cardWidth + gap));
            int y = startY + (row * (cardHeight + gap));
            if (isInside(mouseX, mouseY, x + 16, y + 136, cardWidth - 32, 24)) {
                applyPreset(presets.get(i).id());
                return;
            }
        }
    }

    @Override
    public boolean keyPressed(KeyInput input) {
        if (input.key() == GLFW.GLFW_KEY_RIGHT_SHIFT || input.key() == GLFW.GLFW_KEY_ESCAPE) {
            this.close();
            return true;
        }
        return (this.searchField != null && this.searchField.keyPressed(input)) || super.keyPressed(input);
    }

    @Override
    public boolean charTyped(CharInput input) {
        return (this.searchField != null && this.searchField.charTyped(input)) || super.charTyped(input);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }

    @Override
    public void close() {
        MinecraftClient.getInstance().setScreen(null);
    }

    private void clampScroll() {
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScroll));
    }

    private void clampScrollToTop() {
        this.scrollOffset = 0;
        this.maxScroll = 0;
    }

    private List<Category> activeCategories() {
        if (selectedSection.key().equals("mods")) {
            return moduleCategories;
        }
        if (selectedSection.key().equals("looks")) {
            return List.of(new Category("Themes", "Themes"), new Category("Styles", "Styles"), new Category("Layout", "Layout"));
        }
        return List.of(new Category("Presets", "Presets"));
    }

    private List<FeatureCard> filteredModules() {
        String query = this.searchField == null ? "" : this.searchField.getText().trim().toLowerCase(Locale.ROOT);
        List<FeatureCard> filtered = new ArrayList<>();
        for (FeatureCard card : modules) {
            boolean matchesCategory = selectedCategory.key().equals("All") || card.category().equals(selectedCategory.key());
            boolean matchesQuery = query.isEmpty()
                || card.name().toLowerCase(Locale.ROOT).contains(query)
                || card.category().toLowerCase(Locale.ROOT).contains(query)
                || card.description().toLowerCase(Locale.ROOT).contains(query);
            if (matchesCategory && matchesQuery) {
                filtered.add(card);
            }
        }
        return filtered;
    }

    private List<OptionCard> filteredCosmetics() {
        String query = this.searchField == null ? "" : this.searchField.getText().trim().toLowerCase(Locale.ROOT);
        List<OptionCard> filtered = new ArrayList<>();
        for (OptionCard card : cosmetics) {
            boolean matchesQuery = query.isEmpty()
                || card.name().toLowerCase(Locale.ROOT).contains(query)
                || card.description().toLowerCase(Locale.ROOT).contains(query);
            boolean matchesCategory = switch (selectedCategory.label()) {
                case "Themes" -> card.id().equals("hudTheme") || card.id().equals("accentColor") || card.id().equals("menuOpacity");
                case "Styles" -> card.id().equals("watermarkStyle") || card.id().equals("crosshairStyle") || card.id().equals("uiCorners") || card.id().equals("zoomStrength") || card.id().equals("fpsBoosterProfile");
                case "Layout" -> card.id().equals("editHudLayout");
                default -> true;
            };
            if (matchesQuery && matchesCategory) {
                filtered.add(card);
            }
        }
        return filtered;
    }

    private void seedContent() {
        modules.clear();
        modules.add(new FeatureCard("FPS Booster", "All", "Apply aggressive Minecraft render and visual optimizations instantly.", "fpsBooster", true));

        cosmetics.clear();
        presets.clear();
    }

    private void toggleFeature(String id) {
        BloomConfig config = BloomConfigManager.get();
        switch (id) {
            case "fpsBooster" -> config.fpsBooster = !config.fpsBooster;
            default -> {
                return;
            }
        }
        BloomConfigManager.save();
    }

    private void setOption(String id, String option) {
        BloomConfig config = BloomConfigManager.get();
        switch (id) {
            case "hudTheme" -> config.hudTheme = option;
            case "accentColor" -> config.accentColor = option;
            case "menuOpacity" -> config.menuOpacity = Integer.parseInt(option);
            case "watermarkStyle" -> config.watermarkStyle = option;
            case "crosshairStyle" -> config.crosshairStyle = option;
            case "uiCorners" -> config.uiCorners = option;
            case "zoomStrength" -> config.zoomStrength = option;
            case "fpsBoosterProfile" -> config.fpsBoosterProfile = option;
            default -> {
                return;
            }
        }
        BloomConfigManager.save();
    }

    private void applyPreset(String id) {
        BloomConfig next = switch (id) {
            case "pvp" -> BloomConfig.pvpPreset();
            case "streamer" -> BloomConfig.streamerPreset();
            case "minimal" -> BloomConfig.minimalPreset();
            default -> BloomConfig.defaultConfig();
        };
        BloomConfigManager.set(next);
    }

    private void drawLogoBox(DrawContext context, int x, int y, int width, int height, Palette palette) {
        fillRoundedPanel(context, x, y, width, height, palette.panelSoftFill, palette.borderSoft);
        int availableWidth = width - 12;
        int availableHeight = height - 8;
        float aspect = 612.0F / 408.0F;
        int drawWidth = availableWidth;
        int drawHeight = Math.round(drawWidth / aspect);
        if (drawHeight > availableHeight) {
            drawHeight = availableHeight;
            drawWidth = Math.round(drawHeight * aspect);
        }
        int iconX = x + ((width - drawWidth) / 2);
        int iconY = y + ((height - drawHeight) / 2);
        context.drawTexture(RenderPipelines.GUI_TEXTURED, LOGO_TEXTURE, iconX, iconY, 0.0F, 0.0F, drawWidth, drawHeight, 612, 408, 612, 408);
    }

    private int sectionButtonWidth(int index) {
        return index == 0 ? 126 : 110;
    }

    private int sectionButtonX(int index) {
        int x = sectionRowX;
        for (int i = 0; i < index; i++) {
            x += sectionButtonWidth(i) + 14;
        }
        return x;
    }

    private String ellipsize(String value, int maxWidth) {
        if (this.textRenderer.getWidth(value) <= maxWidth) {
            return value;
        }
        String ellipsis = "...";
        int ellipsisWidth = this.textRenderer.getWidth(ellipsis);
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char next = value.charAt(i);
            if (this.textRenderer.getWidth(builder.toString() + next) + ellipsisWidth > maxWidth) {
                break;
            }
            builder.append(next);
        }
        return builder + ellipsis;
    }

    private void drawWrappedLine(DrawContext context, Text text, int x, int y, int maxWidth, int color) {
        String value = text.getString();
        int split = value.length();
        while (split > 0 && this.textRenderer.getWidth(value.substring(0, split)) > maxWidth) {
            split--;
        }
        if (split <= 0) {
            return;
        }
        context.drawText(this.textRenderer, Text.literal(value.substring(0, split).trim()), x, y, color, false);
        if (split < value.length()) {
            String next = value.substring(split).trim();
            context.drawText(this.textRenderer, Text.literal(ellipsize(next, maxWidth)), x, y + 12, color, false);
        }
    }

    private void fillRoundedPanel(DrawContext context, int x, int y, int width, int height, int fill, int border) {
        boolean smoothCorners = "smooth".equalsIgnoreCase(BloomConfigManager.get().uiCorners);
        if (!smoothCorners) {
            context.fill(x, y, x + width, y + height, fill);
            context.fill(x, y, x + width, y + 1, border);
            context.fill(x, y + height - 1, x + width, y + height, border);
            context.fill(x, y, x + 1, y + height, border);
            context.fill(x + width - 1, y, x + width, y + height, border);
            return;
        }

        context.fill(x + 1, y, x + width - 1, y + height, fill);
        context.fill(x, y + 1, x + width, y + height - 1, fill);
        context.fill(x + 1, y, x + width - 1, y + 1, border);
        context.fill(x + 1, y + height - 1, x + width - 1, y + height, border);
        context.fill(x, y + 1, x + 1, y + height - 1, border);
        context.fill(x + width - 1, y + 1, x + width, y + height - 1, border);
    }

    private boolean isInside(double mouseX, double mouseY, int x, int y, int width, int height) {
        return mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height;
    }

    private String optionLabel(String option) {
        return switch (option) {
            case "wordmark" -> "Wordmark";
            case "compact" -> "Compact";
            case "midnight" -> "Midnight";
            case "frost" -> "Frost";
            case "graphite" -> "Graphite";
            case "obsidian" -> "Obsidian";
            case "void" -> "Void";
            case "rose" -> "Rose";
            case "gold" -> "Gold";
            case "ice" -> "Ice";
            case "violet" -> "Violet";
            case "crimson" -> "Crimson";
            case "ocean" -> "Ocean";
            case "plus" -> "Plus";
            case "dot" -> "Dot";
            case "hard" -> "Hard";
            case "smooth" -> "Smooth";
            case "balanced" -> "Balanced";
            case "aggressive" -> "Aggressive";
            case "extreme" -> "Extreme";
            case "edit layout" -> "Open Editor";
            default -> Character.toUpperCase(option.charAt(0)) + option.substring(1);
        };
    }

    private void drawSectionGlyph(DrawContext context, int x, int y, int index, int color) {
        switch (index) {
            case 0 -> {
                context.fill(x - 6, y - 6, x - 1, y - 1, color);
                context.fill(x + 1, y - 6, x + 6, y - 1, color);
                context.fill(x - 6, y + 1, x - 1, y + 6, color);
                context.fill(x + 1, y + 1, x + 6, y + 6, color);
            }
            case 1 -> {
                context.fill(x - 1, y - 7, x + 1, y + 7, color);
                context.fill(x - 7, y - 1, x + 7, y + 1, color);
                context.fill(x - 4, y - 4, x - 2, y - 2, color);
                context.fill(x + 2, y + 2, x + 4, y + 4, color);
            }
            default -> {
                context.fill(x - 6, y - 6, x + 6, y - 4, color);
                context.fill(x - 6, y + 4, x + 6, y + 6, color);
                context.fill(x - 6, y - 6, x - 4, y + 6, color);
                context.fill(x + 4, y - 6, x + 6, y + 6, color);
            }
        }
    }

    private void drawModuleIcon(DrawContext context, int x, int y, String id, int color) {
        switch (id) {
            case "watermark" -> {
                context.fill(x + 4, y - 8, x + 6, y + 8, color);
                context.fill(x - 4, y - 1, x + 14, y + 1, color);
                context.fill(x, y - 4, x + 10, y - 2, color);
                context.fill(x, y + 2, x + 10, y + 4, color);
            }
            case "coordinates" -> {
                context.fill(x + 4, y - 8, x + 6, y + 8, color);
                context.fill(x - 4, y - 1, x + 14, y + 1, color);
                context.fill(x + 8, y - 8, x + 10, y + 8, color);
            }
            case "armorStatus" -> {
                context.fill(x, y - 8, x + 10, y - 6, color);
                context.fill(x - 2, y - 6, x + 12, y + 6, color);
                context.fill(x + 1, y + 6, x + 9, y + 8, color);
            }
            case "cps" -> {
                context.fill(x - 3, y - 7, x + 1, y + 7, color);
                context.fill(x + 7, y - 7, x + 11, y + 7, color);
                context.fill(x + 1, y + 3, x + 7, y + 7, color);
            }
            case "fpsCounter" -> {
                context.fill(x - 2, y + 4, x + 1, y + 8, color);
                context.fill(x + 3, y, x + 6, y + 8, color);
                context.fill(x + 8, y - 4, x + 11, y + 8, color);
            }
            case "fpsBooster" -> {
                context.fill(x - 4, y + 2, x - 1, y + 8, color);
                context.fill(x + 1, y - 1, x + 4, y + 8, color);
                context.fill(x + 6, y - 4, x + 9, y + 8, color);
                context.fill(x + 11, y - 7, x + 14, y + 8, color);
                context.fill(x + 5, y - 8, x + 7, y - 2, color);
            }
            case "clock" -> {
                context.fill(x, y - 8, x + 10, y - 6, color);
                context.fill(x, y + 6, x + 10, y + 8, color);
                context.fill(x - 2, y - 6, x, y + 6, color);
                context.fill(x + 10, y - 6, x + 12, y + 6, color);
                context.fill(x + 4, y - 1, x + 6, y + 4, color);
                context.fill(x + 6, y - 1, x + 9, y + 1, color);
            }
            case "ping" -> {
                context.fill(x - 2, y + 2, x + 1, y + 8, color);
                context.fill(x + 2, y - 1, x + 5, y + 8, color);
                context.fill(x + 6, y - 4, x + 9, y + 8, color);
                context.fill(x + 10, y - 7, x + 13, y + 8, color);
            }
            case "sprintStatus" -> {
                context.fill(x - 1, y - 8, x + 1, y + 6, color);
                context.fill(x + 1, y + 4, x + 10, y + 6, color);
                context.fill(x + 8, y + 2, x + 10, y + 8, color);
            }
            case "direction" -> {
                context.fill(x + 4, y - 8, x + 6, y + 6, color);
                context.fill(x, y - 2, x + 10, y, color);
                context.fill(x + 2, y - 8, x + 8, y - 4, color);
            }
            case "keystrokes" -> {
                context.fill(x, y - 8, x + 6, y - 2, color);
                context.fill(x - 6, y, x, y + 6, color);
                context.fill(x, y, x + 6, y + 6, color);
                context.fill(x + 6, y, x + 12, y + 6, color);
            }
            case "zoomMod" -> {
                context.fill(x - 4, y - 6, x + 6, y - 4, color);
                context.fill(x - 4, y + 4, x + 6, y + 6, color);
                context.fill(x - 4, y - 6, x - 2, y + 6, color);
                context.fill(x + 4, y - 6, x + 6, y + 6, color);
                context.fill(x + 6, y + 4, x + 10, y + 8, color);
            }
            case "toggleSprintSneak" -> {
                context.fill(x - 4, y - 7, x - 2, y + 7, color);
                context.fill(x + 2, y - 7, x + 4, y + 7, color);
                context.fill(x - 2, y - 2, x + 2, y, color);
            }
            case "potionEffectsHud" -> {
                context.fill(x - 2, y - 8, x + 8, y - 6, color);
                context.fill(x - 4, y - 6, x + 10, y + 6, color);
                context.fill(x - 2, y + 6, x + 8, y + 8, color);
            }
            case "itemCounterHud" -> {
                context.fill(x - 5, y - 6, x + 9, y - 4, color);
                context.fill(x - 3, y - 4, x + 7, y + 6, color);
                context.fill(x - 1, y + 6, x + 5, y + 8, color);
            }
            case "biomeWeatherHud" -> {
                context.fill(x - 6, y + 2, x + 8, y + 4, color);
                context.fill(x - 2, y - 6, x + 4, y + 2, color);
                context.fill(x + 6, y - 6, x + 8, y + 2, color);
            }
            case "customCrosshair" -> {
                context.fill(x + 4, y - 8, x + 6, y + 8, color);
                context.fill(x - 4, y - 1, x + 14, y + 1, color);
            }
            case "tpsDisplay" -> {
                context.fill(x - 2, y + 2, x + 1, y + 8, color);
                context.fill(x + 2, y - 1, x + 5, y + 8, color);
                context.fill(x + 6, y - 4, x + 9, y + 8, color);
                context.fill(x + 10, y - 7, x + 13, y + 8, color);
            }
            default -> context.fill(x, y, x + 8, y + 8, color);
        }
    }

    private void drawCosmeticIcon(DrawContext context, int x, int y, String id, int color) {
        switch (id) {
            case "hudTheme" -> {
                context.fill(x - 8, y - 8, x + 8, y - 6, color);
                context.fill(x - 8, y + 6, x + 8, y + 8, color);
                context.fill(x - 8, y - 8, x - 6, y + 8, color);
                context.fill(x + 6, y - 8, x + 8, y + 8, color);
            }
            case "accentColor" -> {
                context.fill(x - 2, y - 8, x + 2, y + 8, color);
                context.fill(x - 8, y - 2, x + 8, y + 2, color);
            }
            case "watermarkStyle" -> {
                context.fill(x - 4, y - 8, x, y + 8, color);
                context.fill(x + 2, y - 8, x + 6, y + 8, color);
            }
            case "crosshairStyle" -> {
                context.fill(x - 1, y - 8, x + 1, y + 8, color);
                context.fill(x - 8, y - 1, x + 8, y + 1, color);
                context.fill(x - 4, y - 4, x - 2, y - 2, color);
                context.fill(x + 2, y + 2, x + 4, y + 4, color);
            }
            case "menuOpacity" -> {
                context.fill(x - 8, y + 4, x + 8, y + 6, color);
                context.fill(x - 6, y, x - 2, y + 10, color);
                context.fill(x + 2, y - 4, x + 6, y + 10, color);
            }
            case "fpsBoosterProfile" -> {
                context.fill(x - 4, y + 2, x - 1, y + 8, color);
                context.fill(x + 1, y - 1, x + 4, y + 8, color);
                context.fill(x + 6, y - 4, x + 9, y + 8, color);
                context.fill(x + 11, y - 7, x + 14, y + 8, color);
            }
            case "editHudLayout" -> {
                context.fill(x - 8, y - 8, x + 8, y - 6, color);
                context.fill(x - 8, y + 6, x + 8, y + 8, color);
                context.fill(x - 8, y - 8, x - 6, y + 8, color);
                context.fill(x + 6, y - 8, x + 8, y + 8, color);
                context.fill(x + 2, y + 2, x + 8, y + 8, color);
            }
            default -> context.fill(x - 6, y - 6, x + 6, y + 6, color);
        }
    }

    private record Section(String key, String label) { }

    private record Category(String key, String label) { }

    private record FeatureCard(String name, String category, String description, String id, boolean implemented) {
        boolean enabled() {
            if (!implemented) {
                return false;
            }
            BloomConfig config = BloomConfigManager.get();
            return switch (id) {
                case "fpsBooster" -> config.fpsBooster;
                case "watermark" -> config.watermark;
                case "coordinates" -> config.coordinates;
                case "armorStatus" -> config.armorStatus;
                case "cps" -> config.cps;
                case "fpsCounter" -> config.fpsCounter;
                case "clock" -> config.clock;
                case "ping" -> config.ping;
                case "sprintStatus" -> config.sprintStatus;
                case "direction" -> config.direction;
                case "keystrokes" -> config.keystrokes;
                case "potionEffectsHud" -> config.potionEffectsHud;
                case "itemCounterHud" -> config.itemCounterHud;
                case "biomeWeatherHud" -> config.biomeWeatherHud;
                case "tpsDisplay" -> config.tpsDisplay;
                case "customCrosshair" -> config.crosshairEnabled;
                case "zoomMod" -> config.zoomEnabled;
                case "toggleSprintSneak" -> config.toggleSprintSneak;
                default -> false;
            };
        }
    }

    private record OptionCard(String name, String description, String id, List<String> options) {
        String currentValue() {
            BloomConfig config = BloomConfigManager.get();
            return switch (id) {
                case "hudTheme" -> config.hudTheme;
                case "accentColor" -> config.accentColor;
                case "fpsBoosterProfile" -> config.fpsBoosterProfile;
                case "watermarkStyle" -> config.watermarkStyle;
                case "crosshairStyle" -> config.crosshairStyle;
                case "menuOpacity" -> String.valueOf(config.menuOpacity);
                case "uiCorners" -> config.uiCorners;
                case "zoomStrength" -> config.zoomStrength;
                case "editHudLayout" -> "Edit layout";
                default -> "";
            };
        }
    }

    private record PresetCard(String name, String description, String icon, String id) { }

    private record HubAction(String id, String label, boolean active) { }

    private record Palette(
        int accent,
        int accentBright,
        int accentPanel,
        int shellFill,
        int panelFill,
        int panelAltFill,
        int panelSoftFill,
        int panelHoverFill,
        int borderStrong,
        int borderSoft,
        int success,
        int backdropGlow
    ) {
        static Palette resolve(BloomConfig config) {
            String accent = config == null ? "mint" : config.accentColor;
            String theme = config == null ? "bloom" : config.hudTheme;
            int opacity = config == null ? 88 : config.menuOpacity;
            int accentColor = switch (accent) {
                case "rose" -> 0xFFF26A8D;
                case "gold" -> 0xFFF2C14E;
                case "ice" -> 0xFF75D7FF;
                case "violet" -> 0xFFAE8BFF;
                case "crimson" -> 0xFFFF6B6B;
                case "ocean" -> 0xFF4FC3F7;
                default -> 0xFF7BE6BD;
            };
            int panelAlpha = Math.round((Math.max(40, Math.min(100, opacity)) / 100.0F) * 255.0F);
            int shellFill = argb(Math.min(255, panelAlpha + 26), 8, 11, 16);
            return switch (theme) {
                case "midnight" -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 16, 17, 23), argb(panelAlpha, 20, 24, 33), argb(panelAlpha - 24, 17, 22, 30), argb(panelAlpha, 25, 32, 44), 0xFF243041, 0xFF202938, 0xFF2EA043, 0x102D6BFF);
                case "frost" -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 20, 28, 36), argb(panelAlpha, 24, 34, 46), argb(panelAlpha - 24, 22, 31, 40), argb(panelAlpha, 34, 46, 60), 0xFF315268, 0xFF294050, 0xFF2EA043, 0x102C8FFF);
                case "graphite" -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 14, 16, 20), argb(panelAlpha, 18, 20, 25), argb(panelAlpha - 24, 16, 18, 22), argb(panelAlpha, 27, 30, 38), 0xFF303744, 0xFF282E38, 0xFF2EA043, 0x10191D28);
                case "obsidian" -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 8, 10, 14), argb(panelAlpha, 12, 14, 18), argb(panelAlpha - 24, 10, 12, 16), argb(panelAlpha, 18, 22, 28), 0xFF262F3D, 0xFF1F2730, 0xFF2EA043, 0x100E1117);
                case "void" -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 4, 5, 8), argb(panelAlpha, 8, 9, 12), argb(panelAlpha - 24, 7, 8, 10), argb(panelAlpha, 14, 16, 20), 0xFF232B38, 0xFF1A2029, 0xFF2EA043, 0x10080A0E);
                default -> new Palette(accentColor, brighten(accentColor), translucent(accentColor, 70), shellFill, argb(panelAlpha, 18, 21, 28), argb(panelAlpha, 22, 27, 35), argb(panelAlpha - 24, 18, 22, 29), argb(panelAlpha, 28, 34, 44), 0xFF243041, 0xFF202938, 0xFF2EA043, 0x10339CFF);
            };
        }

        private static int argb(int alpha, int red, int green, int blue) {
            int safeAlpha = Math.max(0, Math.min(255, alpha));
            return ((safeAlpha & 0xFF) << 24) | ((red & 0xFF) << 16) | ((green & 0xFF) << 8) | (blue & 0xFF);
        }

        private static int brighten(int color) {
            int red = Math.min(255, ((color >> 16) & 0xFF) + 38);
            int green = Math.min(255, ((color >> 8) & 0xFF) + 38);
            int blue = Math.min(255, (color & 0xFF) + 38);
            return 0xFF000000 | (red << 16) | (green << 8) | blue;
        }

        private static int translucent(int color, int alpha) {
            return ((alpha & 0xFF) << 24) | (color & 0x00FFFFFF);
        }
    }
}
