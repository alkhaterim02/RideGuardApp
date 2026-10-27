package com.rideguard.app.data;

import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.storage.FirebaseStorage;
import com.rideguard.app.BuildConfig;

/**
 * Firebase entry point. With google-services.json the app talks to your project; with rideguard.emulatorHost set in
 * local.properties (debug builds) it talks to the local Emulator Suite instead.
 */
public final class Fb {
    private Fb() {}

    public static final String EMULATOR_PROJECT = "demo-rideguard";
    private static boolean ready;

    public static boolean usingEmulators() { return !BuildConfig.EMULATOR_HOST.isEmpty(); }

    /** Called once from RideGuardApp. Returns false if there is no configuration at all. */
    public static synchronized boolean init(Context ctx) {
        if (ready) return true;
        if (FirebaseApp.getApps(ctx).isEmpty()) {
            if (!usingEmulators()) return false;              // no google-services.json and no emulator host
            FirebaseApp.initializeApp(ctx, new FirebaseOptions.Builder()
                    .setProjectId(EMULATOR_PROJECT)
                    .setApplicationId("1:000000000000:android:0000000000000000")
                    .setApiKey("demo-api-key-for-local-emulators-only")
                    .setStorageBucket(EMULATOR_PROJECT + ".appspot.com")
                    .build());
        }
        if (usingEmulators()) {
            String h = BuildConfig.EMULATOR_HOST;
            FirebaseAuth.getInstance().useEmulator(h, 9099);
            FirebaseFirestore.getInstance().useEmulator(h, 8080);
            FirebaseStorage.getInstance().useEmulator(h, 9199);
        }
        ready = true;
        return true;
    }

    public static boolean isReady() { return ready; }
    public static FirebaseAuth auth() { return FirebaseAuth.getInstance(); }
    public static FirebaseFirestore db() { return FirebaseFirestore.getInstance(); }
    public static FirebaseStorage storage() { return FirebaseStorage.getInstance(); }
    public static String uid() { return auth().getCurrentUser() == null ? null : auth().getCurrentUser().getUid(); }
}
