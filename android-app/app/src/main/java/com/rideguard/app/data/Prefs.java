package com.rideguard.app.data;

import android.content.Context;
import android.content.SharedPreferences;

/** Small per-device settings. Nothing sensitive is stored here. */
public final class Prefs {
    private Prefs() {}

    private static SharedPreferences p(Context c) { return c.getSharedPreferences("rideguard", Context.MODE_PRIVATE); }

    /** Demo mode: SOS alerts are marked as simulations and the vest panel shows simulated status. On by default. */
    public static boolean demoMode(Context c) { return p(c).getBoolean("demo", true); }
    public static void setDemoMode(Context c, boolean on) { p(c).edit().putBoolean("demo", on).apply(); }

    public static boolean riding(Context c) { return p(c).getBoolean("riding", false); }
    public static void setRiding(Context c, boolean on) { p(c).edit().putBoolean("riding", on).apply(); }
}
