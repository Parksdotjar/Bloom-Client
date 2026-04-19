package blooms_kernel.modules;

import blooms_kernel.KernelUiConfig;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gl.RenderPipelines;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.EquipmentSlot;
import net.minecraft.item.ItemStack;
import net.minecraft.util.Identifier;

public final class ArmorHudModule extends Module {
    private static final EquipmentSlot[] EQUIPMENT_ORDER = {
        EquipmentSlot.HEAD,
        EquipmentSlot.CHEST,
        EquipmentSlot.LEGS,
        EquipmentSlot.FEET
    };
    private static final Identifier HOTBAR_TEXTURE = Identifier.ofVanilla("hud/hotbar");
    private static final Identifier HOTBAR_SELECTION_TEXTURE = Identifier.ofVanilla("hud/hotbar_selection");
    private static final RenderPipeline GUI_TEXTURED = RenderPipelines.GUI_TEXTURED;
    private static final int SLOT_ITEM_SIZE = 16;
    private static final int HOTBAR_SLOT_WIDTH = 20;
    private static final int HOTBAR_HEIGHT = 22;
    private static final int HOTBAR_BORDER = 2;
    private static final int VERTICAL_SLOT_SIZE = 24;

    public ArmorHudModule() {
        super("Armor HUD", 4, 84, 220, 20);
    }

    @Override
    public void render(DrawContext ctx, MinecraftClient mc) {
        if (mc.player == null) {
            return;
        }

        boolean horizontal = KernelUiConfig.isArmorHorizontal();
        boolean slotStyle = KernelUiConfig.isArmorSlotStyle();
        boolean showDurability = KernelUiConfig.isArmorShowDurability();
        int textPosition = KernelUiConfig.getArmorTextPosition();
        int spacing = KernelUiConfig.getArmorSpacing();
        int itemCount = EQUIPMENT_ORDER.length;
        int slotStride = slotStyle ? (horizontal ? HOTBAR_SLOT_WIDTH : VERTICAL_SLOT_SIZE) : spacing;
        int bodyWidth = horizontal
            ? (slotStyle ? HOTBAR_BORDER + (itemCount * HOTBAR_SLOT_WIDTH) : Math.max(72, (spacing * (itemCount - 1)) + 22))
            : (slotStyle ? VERTICAL_SLOT_SIZE : 72);
        int bodyHeight = horizontal
            ? (slotStyle ? HOTBAR_HEIGHT : 24)
            : (slotStyle ? itemCount * VERTICAL_SLOT_SIZE : Math.max(24, (spacing * (itemCount - 1)) + 22));
        int textScale = KernelUiConfig.getArmorTextScale();
        int textLineHeight = showDurability && textPosition == 0 ? scaledTextHeight(textScale) + 3 : 0;

        setWidth(bodyWidth);
        setHeight(bodyHeight + textLineHeight);

        if (slotStyle) {
            drawSlotFrame(ctx, horizontal, itemCount);
        } else {
            drawBox(ctx, 0x66000000);
        }

        int baseX = getX() + (slotStyle ? (horizontal ? HOTBAR_BORDER + 2 : 4) : 3);
        int baseY = getY() + (slotStyle ? 3 : 2);
        int totalWidth = horizontal ? ((itemCount - 1) * slotStride) + SLOT_ITEM_SIZE : SLOT_ITEM_SIZE;
        int totalHeight = horizontal ? SLOT_ITEM_SIZE : ((itemCount - 1) * slotStride) + SLOT_ITEM_SIZE;
        int textAreaTop = getY() + bodyHeight;

        for (int index = 0; index < itemCount; index++) {
            EquipmentSlot slot = EQUIPMENT_ORDER[index];
            ItemStack stack = mc.player.getEquippedStack(slot);
            int drawX = baseX + (horizontal ? index * slotStride : 0);
            int drawY = baseY + (horizontal ? 0 : index * slotStride);

            if (!stack.isEmpty()) {
                ctx.drawItem(stack, drawX, drawY);
                ctx.drawStackOverlay(mc.textRenderer, stack, drawX, drawY, null);
            }

            if (showDurability && stack.isDamageable()) {
                drawDurability(ctx, mc, drawX, drawY, textAreaTop, stack);
            }
        }

        // Keep the drag bounds consistent with the visible content instead of the previous stale fixed size.
        setWidth(Math.max(getWidth(), totalWidth + (slotStyle ? (horizontal ? HOTBAR_BORDER * 2 + 4 : 8) : 6)));
        setHeight(Math.max(getHeight(), totalHeight + (slotStyle ? 6 : 4) + textLineHeight));
    }

    private void drawSlotFrame(DrawContext ctx, boolean horizontal, int itemCount) {
        if (horizontal) {
            int textureWidth = HOTBAR_BORDER + (itemCount * HOTBAR_SLOT_WIDTH);
            ctx.drawTexture(GUI_TEXTURED, HOTBAR_TEXTURE, getX(), getY(), 0.0F, 0.0F, textureWidth, HOTBAR_HEIGHT, 182, HOTBAR_HEIGHT);
            return;
        }

        for (int index = 0; index < itemCount; index++) {
            int slotY = getY() + (index * VERTICAL_SLOT_SIZE);
            ctx.drawGuiTexture(GUI_TEXTURED, HOTBAR_SELECTION_TEXTURE, getX(), slotY, VERTICAL_SLOT_SIZE, VERTICAL_SLOT_SIZE);
        }
    }

    private void drawDurability(DrawContext ctx, MinecraftClient mc, int itemX, int itemY, int textAreaTop, ItemStack stack) {
        int durability = stack.getMaxDamage() - stack.getDamage();
        String text = String.valueOf(durability);
        int textWidth = mc.textRenderer.getWidth(text);
        int textScale = KernelUiConfig.getArmorTextScale();
        int textPosition = KernelUiConfig.getArmorTextPosition();

        if (textPosition == 2) {
            return;
        }

        int textX;
        int textY;
        if (textPosition == 1) {
            textX = itemX + ((SLOT_ITEM_SIZE - scaledWidth(textWidth, textScale)) / 2);
            textY = itemY + 11;
        } else {
            textX = itemX + ((SLOT_ITEM_SIZE - scaledWidth(textWidth, textScale)) / 2);
            textY = textAreaTop;
        }
        drawScaledText(ctx, mc, text, textX, textY, 0xFFFFFFFF, textScale);
    }

    private void drawScaledText(DrawContext ctx, MinecraftClient mc, String text, int x, int y, int color, int percent) {
        float scale = percent / 100.0F;
        ctx.getMatrices().pushMatrix();
        ctx.getMatrices().translate(x, y);
        ctx.getMatrices().scale(scale, scale);
        ctx.getMatrices().translate(-x, -y);
        ctx.drawTextWithShadow(mc.textRenderer, text, Math.round(x / scale), Math.round(y / scale), color);
        ctx.getMatrices().popMatrix();
    }

    private int scaledWidth(int baseWidth, int percent) {
        return Math.round(baseWidth * (percent / 100.0F));
    }

    private int scaledTextHeight(int percent) {
        return Math.round(9.0F * (percent / 100.0F));
    }
}
