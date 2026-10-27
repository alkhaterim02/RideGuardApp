package com.rideguard.app.data;

/** Deadline-based countdown math: pausing/recreating a screen can never reset the countdown. */
public final class CountdownController {
    private CountdownController() {}

    public static long remainingSeconds(long deadlineMs, long nowMs) {
        long left = deadlineMs - nowMs;
        return left <= 0 ? 0 : (left + 999) / 1000;
    }

    public static boolean isExpired(long deadlineMs, long nowMs) { return nowMs >= deadlineMs; }
}
