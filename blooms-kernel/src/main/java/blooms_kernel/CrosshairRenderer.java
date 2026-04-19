package blooms_kernel;

import net.minecraft.client.gui.DrawContext;

public final class CrosshairRenderer {
    private static final int OUTLINE_COLOR = 0xFF000000;

    private CrosshairRenderer() {
    }

    public static void render(DrawContext context, int centerX, int centerY, boolean targetIndicator) {
        int length = targetIndicator ? KernelUiConfig.getTargetCrosshairLength() : KernelUiConfig.getCrosshairLength();
        int thickness = targetIndicator ? KernelUiConfig.getTargetCrosshairThickness() : KernelUiConfig.getCrosshairThickness();
        int gap = targetIndicator ? KernelUiConfig.getTargetCrosshairGap() : KernelUiConfig.getCrosshairGap();
        int dotSize = targetIndicator ? KernelUiConfig.getTargetCrosshairDotSize() : KernelUiConfig.getCrosshairDotSize();
        boolean dotEnabled = targetIndicator ? KernelUiConfig.isTargetCrosshairDotEnabled() : KernelUiConfig.isCrosshairDotEnabled();
        boolean linesEnabled = targetIndicator ? KernelUiConfig.isTargetCrosshairLinesEnabled() : KernelUiConfig.isCrosshairLinesEnabled();
        boolean outlineEnabled = targetIndicator ? KernelUiConfig.isTargetCrosshairOutlineEnabled() : KernelUiConfig.isCrosshairOutlineEnabled();
        int rotation = targetIndicator ? KernelUiConfig.getTargetCrosshairRotation() : KernelUiConfig.getCrosshairRotation();
        int color = 0xFF000000 | (targetIndicator ? KernelUiConfig.getTargetCrosshairColor() : KernelUiConfig.getCrosshairColor());

        context.getMatrices().pushMatrix();
        context.getMatrices().translate(centerX, centerY);
        context.getMatrices().rotate((float) Math.toRadians(rotation));
        context.getMatrices().translate(-centerX, -centerY);

        int half = thickness / 2;
        if (linesEnabled) {
            fillSegment(context, centerX - half, centerY - gap - length, centerX + half + 1, centerY - gap, color, outlineEnabled);
            fillSegment(context, centerX - half, centerY + gap + 1, centerX + half + 1, centerY + gap + length + 1, color, outlineEnabled);
            fillSegment(context, centerX - gap - length, centerY - half, centerX - gap, centerY + half + 1, color, outlineEnabled);
            fillSegment(context, centerX + gap + 1, centerY - half, centerX + gap + length + 1, centerY + half + 1, color, outlineEnabled);
        }
        if (dotEnabled) {
            int dHalf = dotSize / 2;
            fillSegment(context, centerX - dHalf, centerY - dHalf, centerX + dHalf + 1, centerY + dHalf + 1, color, outlineEnabled);
        }
        context.getMatrices().popMatrix();
    }

    private static void fillSegment(DrawContext context, int x1, int y1, int x2, int y2, int color, boolean outlineEnabled) {
        if (outlineEnabled) {
            context.fill(x1 - 1, y1 - 1, x2 + 1, y2 + 1, OUTLINE_COLOR);
        }
        context.fill(x1, y1, x2, y2, color);
    }
}
