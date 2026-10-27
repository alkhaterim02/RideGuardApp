package com.rideguard.app.data;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class CountdownControllerTest {
    private static final long T0 = 1_000_000L;

    @Test public void remainingSecondsRoundsUpAndNeverNegative() {
        assertEquals(20, CountdownController.remainingSeconds(T0 + 20000, T0));
        assertEquals(1, CountdownController.remainingSeconds(T0 + 1, T0));
        assertEquals(0, CountdownController.remainingSeconds(T0, T0 + 500));
    }

    @Test public void expiresExactlyAtDeadline() {
        assertFalse(CountdownController.isExpired(T0, T0 - 1));
        assertTrue(CountdownController.isExpired(T0, T0));
    }
}
