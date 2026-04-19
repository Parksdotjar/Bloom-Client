package blooms_kernel;

public final class SpeedTracker {
    private static volatile double blocksPerSecond;

    private SpeedTracker() {
    }

    public static void setBlocksPerSecond(double value) {
        blocksPerSecond = value;
    }

    public static double getBlocksPerSecond() {
        return blocksPerSecond;
    }
}

