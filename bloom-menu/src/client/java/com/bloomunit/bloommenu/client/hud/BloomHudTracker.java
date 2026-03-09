package com.bloomunit.bloommenu.client.hud;

import net.minecraft.client.MinecraftClient;

import java.util.ArrayDeque;
import java.util.Deque;

public final class BloomHudTracker {
    private static final Deque<Long> LEFT_CLICKS = new ArrayDeque<>();
    private static final Deque<Long> RIGHT_CLICKS = new ArrayDeque<>();
    private static final Deque<Long> TICKS = new ArrayDeque<>();

    private static boolean lastAttackPressed;
    private static boolean lastUsePressed;

    private BloomHudTracker() {
    }

    public static void tick(MinecraftClient client) {
        if (client == null || client.options == null) {
            return;
        }

        boolean attackPressed = client.options.attackKey.isPressed();
        boolean usePressed = client.options.useKey.isPressed();
        long now = System.currentTimeMillis();

        if (attackPressed && !lastAttackPressed) {
            LEFT_CLICKS.addLast(now);
        }
        if (usePressed && !lastUsePressed) {
            RIGHT_CLICKS.addLast(now);
        }

        lastAttackPressed = attackPressed;
        lastUsePressed = usePressed;
        TICKS.addLast(now);
        prune(now);
    }

    public static int leftCps() {
        prune(System.currentTimeMillis());
        return LEFT_CLICKS.size();
    }

    public static int rightCps() {
        prune(System.currentTimeMillis());
        return RIGHT_CLICKS.size();
    }

    public static int estimatedTps() {
        prune(System.currentTimeMillis());
        return Math.max(0, Math.min(20, TICKS.size()));
    }

    private static void prune(long now) {
        while (!LEFT_CLICKS.isEmpty() && LEFT_CLICKS.peekFirst() < now - 1000L) {
            LEFT_CLICKS.removeFirst();
        }
        while (!RIGHT_CLICKS.isEmpty() && RIGHT_CLICKS.peekFirst() < now - 1000L) {
            RIGHT_CLICKS.removeFirst();
        }
        while (!TICKS.isEmpty() && TICKS.peekFirst() < now - 1000L) {
            TICKS.removeFirst();
        }
    }
}
