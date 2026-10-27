package com.rideguard.app.data;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

/**
 * Phone location, used for app-originated alerts (SOS, simulations) and "Update location".
 * Normal riding location is never collected; the vest's own GNSS is used for vest alerts.
 */
public final class Locator {
    private Locator() {}

    public static boolean permitted(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Resolves to a fresh fix, or the last known one, or null – never fails, so alerts are never blocked on GPS. */
    @SuppressLint("MissingPermission")
    public static Task<Location> current(Context c) {
        if (!permitted(c)) return Tasks.forResult(null);
        var client = LocationServices.getFusedLocationProviderClient(c);
        CancellationTokenSource cts = new CancellationTokenSource();
        return client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                .continueWithTask(t -> {
                    if (t.isSuccessful() && t.getResult() != null) return Tasks.forResult(t.getResult());
                    return client.getLastLocation();
                })
                .continueWith(t -> t.isSuccessful() ? t.getResult() : null);
    }
}
