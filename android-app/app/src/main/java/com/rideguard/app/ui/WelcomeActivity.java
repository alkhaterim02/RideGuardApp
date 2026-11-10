package com.rideguard.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.rideguard.app.data.Fb;
import com.rideguard.app.databinding.ActivityWelcomeBinding;

public class WelcomeActivity extends BaseActivity {
    private ActivityWelcomeBinding b;

    @Override protected boolean needsSession() { return false; }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        b = ActivityWelcomeBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());

        if (!Fb.isReady()) {
            b.banner.setVisibility(View.VISIBLE);
            b.banner.setText("Firebase is not configured. Put google-services.json in android-app/app (see docs/FIREBASE_SETUP.md).");
            b.riderBtn.setEnabled(false);
            b.companyBtn.setEnabled(false);
        } else if (Fb.usingEmulators()) {
            b.banner.setVisibility(View.VISIBLE);
            b.banner.setText("Test build: connected to the local Firebase emulators.");
        }

        b.riderBtn.setOnClickListener(v -> startActivity(new Intent(this, LoginActivity.class).putExtra(LoginActivity.EXTRA_RIDER, true)));
        b.companyBtn.setOnClickListener(v -> startActivity(new Intent(this, LoginActivity.class).putExtra(LoginActivity.EXTRA_RIDER, false)));
        b.helpBtn.setOnClickListener(v -> new MaterialAlertDialogBuilder(this)
                .setTitle("About RideGuard")
                .setMessage("RideGuard is a smart vest for motorcycle riders. It detects a possible accident, gives you "
                        + "time to cancel, then sends your location to your emergency contact and your company.\n\n"
                        + "Riders: sign in with the email your company gave you, or register with your company's join code.\n\n"
                        + "Companies: sign in with your staff account to see and manage emergencies.\n\n"
                        + "The vest sends its own SMS and keeps working even if this phone is off. RideGuard supports "
                        + "emergency reporting; it does not replace calling emergency services.")
                .setPositiveButton("OK", null).show());

        // Already signed in: go straight to the right home screen.
        if (Fb.isReady() && Fb.uid() != null) {
            b.progress.setVisibility(View.VISIBLE);
            Router.afterSignIn(this, null, msg -> { b.progress.setVisibility(View.GONE); Ui.toast(this, msg); });
        }
    }
}
