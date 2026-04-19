package blooms_kernel;

public final class InputTracker {
    private static volatile long lastLeftClickAt;
    private static volatile long lastRightClickAt;
    private static volatile int leftClicksSinceLastSecond;
    private static volatile int rightClicksSinceLastSecond;

    private InputTracker() {
    }

    public static void registerLeftClick() {
        lastLeftClickAt = System.currentTimeMillis();
        leftClicksSinceLastSecond++;
    }

    public static void registerRightClick() {
        lastRightClickAt = System.currentTimeMillis();
        rightClicksSinceLastSecond++;
    }

    public static int consumeLeftClicksSinceLastSecond() {
        int value = leftClicksSinceLastSecond;
        leftClicksSinceLastSecond = 0;
        return value;
    }

    public static int consumeRightClicksSinceLastSecond() {
        int value = rightClicksSinceLastSecond;
        rightClicksSinceLastSecond = 0;
        return value;
    }

    public static long getLastLeftClickAt() {
        return lastLeftClickAt;
    }

    public static long getLastRightClickAt() {
        return lastRightClickAt;
    }
}

