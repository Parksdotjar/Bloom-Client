package blooms_kernel.screen;

import blooms_kernel.BloomsKernel;
import blooms_kernel.HudLayoutManager;
import blooms_kernel.modules.Module;
import net.minecraft.client.gui.Click;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;

import java.awt.Rectangle;

public final class HudEditorScreen extends Screen {
    private static final int HANDLE_SIZE = 6;
    private static final int MIN_WIDTH = 40;
    private static final int MIN_HEIGHT = 16;

    private enum ResizeHandle {
        TOP_LEFT,
        TOP_RIGHT,
        BOTTOM_LEFT,
        BOTTOM_RIGHT
    }

    private final Screen parent;
    private Module draggingModule;
    private Module resizingModule;
    private int dragOffsetX;
    private int dragOffsetY;
    private int resizeStartMouseX;
    private int resizeStartMouseY;
    private int resizeStartX;
    private int resizeStartY;
    private int resizeStartWidth;
    private int resizeStartHeight;
    private ResizeHandle activeResizeHandle;
    private Module hoveredModule;
    private ResizeHandle hoveredResizeHandle;
    private long arrowCursor;
    private long resizeCursor;
    private long activeCursor;

    public HudEditorScreen(Screen parent) {
        super(Text.literal("HUD Editor"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        if (arrowCursor == 0L) {
            arrowCursor = GLFW.glfwCreateStandardCursor(GLFW.GLFW_ARROW_CURSOR);
        }
        if (resizeCursor == 0L) {
            resizeCursor = GLFW.glfwCreateStandardCursor(GLFW.GLFW_HRESIZE_CURSOR);
        }
        setCursor(arrowCursor);
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        hoveredModule = null;
        hoveredResizeHandle = null;
        for (Module module : BloomsKernel.getModuleManager().getEnabledModules()) {
            if (!module.isHudElement()) {
                continue;
            }
            module.render(context, client);
            Rectangle bounds = module.getBounds();
            if (bounds.contains(mouseX, mouseY)) {
                hoveredModule = module;
                context.drawStrokedRectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xFFFFFFFF);
            }
        }
        if (hoveredModule != null) {
            drawResizeHandles(context, hoveredModule, 0xFFFFFFFF);
            hoveredResizeHandle = findHandleAt(hoveredModule, mouseX, mouseY);
        }
        boolean shouldResizeCursor = resizingModule != null || hoveredResizeHandle != null;
        setCursor(shouldResizeCursor ? resizeCursor : arrowCursor);
        context.drawTextWithShadow(textRenderer, "Drag to move. Drag corner squares to resize. Esc to save", 8, 8, 0xFFFFFF);
    }

    @Override
    public void renderBackground(DrawContext context, int mouseX, int mouseY, float delta) {
        context.fill(0, 0, width, height, 0xC0101010);
    }

    @Override
    public boolean mouseClicked(Click click, boolean doubleClick) {
        int mouseX = (int) click.x();
        int mouseY = (int) click.y();
        for (Module module : BloomsKernel.getModuleManager().getEnabledModules()) {
            if (!module.isHudElement()) {
                continue;
            }
            ResizeHandle handle = findHandleAt(module, mouseX, mouseY);
            if (handle != null) {
                resizingModule = module;
                activeResizeHandle = handle;
                resizeStartMouseX = mouseX;
                resizeStartMouseY = mouseY;
                resizeStartX = module.getX();
                resizeStartY = module.getY();
                resizeStartWidth = module.getWidth();
                resizeStartHeight = module.getHeight();
                return true;
            }
            Rectangle bounds = module.getBounds();
            if (bounds.contains((int) mouseX, (int) mouseY)) {
                draggingModule = module;
                dragOffsetX = (int) mouseX - module.getX();
                dragOffsetY = (int) mouseY - module.getY();
                return true;
            }
        }
        return super.mouseClicked(click, doubleClick);
    }

    @Override
    public boolean mouseDragged(Click click, double deltaX, double deltaY) {
        if (resizingModule != null && activeResizeHandle != null) {
            applyResize((int) click.x(), (int) click.y());
            return true;
        }
        if (draggingModule != null) {
            draggingModule.setX((int) click.x() - dragOffsetX);
            draggingModule.setY((int) click.y() - dragOffsetY);
            return true;
        }
        return super.mouseDragged(click, deltaX, deltaY);
    }

    @Override
    public boolean mouseReleased(Click click) {
        draggingModule = null;
        resizingModule = null;
        activeResizeHandle = null;
        return super.mouseReleased(click);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double horizontalAmount, double verticalAmount) {
        return super.mouseScrolled(mouseX, mouseY, horizontalAmount, verticalAmount);
    }

    @Override
    public void close() {
        setCursor(arrowCursor);
        HudLayoutManager.save(BloomsKernel.getModuleManager());
        if (client != null) {
            client.setScreen(parent);
        }
    }

    @Override
    public void removed() {
        setCursor(arrowCursor);
        super.removed();
    }

    private void setCursor(long cursor) {
        if (client == null || client.getWindow() == null) {
            return;
        }
        if (activeCursor == cursor) {
            return;
        }
        GLFW.glfwSetCursor(client.getWindow().getHandle(), cursor);
        activeCursor = cursor;
    }

    private void drawResizeHandles(DrawContext context, Module module, int color) {
        Rectangle bounds = module.getBounds();
        int left = bounds.x;
        int right = bounds.x + bounds.width - HANDLE_SIZE;
        int top = bounds.y;
        int bottom = bounds.y + bounds.height - HANDLE_SIZE;
        context.fill(left, top, left + HANDLE_SIZE, top + HANDLE_SIZE, color);
        context.fill(right, top, right + HANDLE_SIZE, top + HANDLE_SIZE, color);
        context.fill(left, bottom, left + HANDLE_SIZE, bottom + HANDLE_SIZE, color);
        context.fill(right, bottom, right + HANDLE_SIZE, bottom + HANDLE_SIZE, color);
    }

    private ResizeHandle findHandleAt(Module module, int mouseX, int mouseY) {
        Rectangle bounds = module.getBounds();
        if (inside(mouseX, mouseY, bounds.x, bounds.y, HANDLE_SIZE, HANDLE_SIZE)) {
            return ResizeHandle.TOP_LEFT;
        }
        if (inside(mouseX, mouseY, bounds.x + bounds.width - HANDLE_SIZE, bounds.y, HANDLE_SIZE, HANDLE_SIZE)) {
            return ResizeHandle.TOP_RIGHT;
        }
        if (inside(mouseX, mouseY, bounds.x, bounds.y + bounds.height - HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE)) {
            return ResizeHandle.BOTTOM_LEFT;
        }
        if (inside(mouseX, mouseY, bounds.x + bounds.width - HANDLE_SIZE, bounds.y + bounds.height - HANDLE_SIZE, HANDLE_SIZE, HANDLE_SIZE)) {
            return ResizeHandle.BOTTOM_RIGHT;
        }
        return null;
    }

    private boolean inside(int mouseX, int mouseY, int x, int y, int width, int height) {
        return mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
    }

    private void applyResize(int mouseX, int mouseY) {
        if (resizingModule == null || activeResizeHandle == null) {
            return;
        }
        int dx = mouseX - resizeStartMouseX;
        int dy = mouseY - resizeStartMouseY;

        int newX = resizeStartX;
        int newY = resizeStartY;
        int newWidth = resizeStartWidth;
        int newHeight = resizeStartHeight;

        switch (activeResizeHandle) {
            case TOP_LEFT -> {
                newX = resizeStartX + dx;
                newY = resizeStartY + dy;
                newWidth = resizeStartWidth - dx;
                newHeight = resizeStartHeight - dy;
            }
            case TOP_RIGHT -> {
                newY = resizeStartY + dy;
                newWidth = resizeStartWidth + dx;
                newHeight = resizeStartHeight - dy;
            }
            case BOTTOM_LEFT -> {
                newX = resizeStartX + dx;
                newWidth = resizeStartWidth - dx;
                newHeight = resizeStartHeight + dy;
            }
            case BOTTOM_RIGHT -> {
                newWidth = resizeStartWidth + dx;
                newHeight = resizeStartHeight + dy;
            }
        }

        if (newWidth < MIN_WIDTH) {
            if (activeResizeHandle == ResizeHandle.TOP_LEFT || activeResizeHandle == ResizeHandle.BOTTOM_LEFT) {
                newX = resizeStartX + (resizeStartWidth - MIN_WIDTH);
            }
            newWidth = MIN_WIDTH;
        }
        if (newHeight < MIN_HEIGHT) {
            if (activeResizeHandle == ResizeHandle.TOP_LEFT || activeResizeHandle == ResizeHandle.TOP_RIGHT) {
                newY = resizeStartY + (resizeStartHeight - MIN_HEIGHT);
            }
            newHeight = MIN_HEIGHT;
        }

        resizingModule.setX(newX);
        resizingModule.setY(newY);
        resizingModule.setWidth(newWidth);
        resizingModule.setHeight(newHeight);
    }
}
