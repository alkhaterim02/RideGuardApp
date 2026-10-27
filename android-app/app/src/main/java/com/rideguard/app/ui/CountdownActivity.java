package com.rideguard.app.ui;

import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import androidx.activity.OnBackPressedCallback;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.rideguard.app.data.CountdownController;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityCountdownBinding;
import com.rideguard.app.model.Incident;

/**
 * Possible-accident countdown (13.6). Driven by the incident's server timestamp + countdownSeconds, so leaving
 * and reopening the screen never resets it. For a vest incident the vest decides; for an app simulation this
 * screen confirms it when time runs out (the rules check the server clock).
 */
public class CountdownActivity extends BaseActivity {
    static final String EXTRA_ID = "incident_id";
    private static final int MAX_CONFIRM_TRIES = 6;

    private ActivityCountdownBinding b;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private String id;
    private Incident inc;
    private boolean finishing, confirming;
    private int confirmTries;
    private ToneGenerator tone;
    private Vibrator vibrator;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (inc != null && inc.isPending()) {
                long now = System.currentTimeMillis();
                long left = CountdownController.remainingSeconds(inc.deadlineMs(), now);
                b.seconds.setText(String.valueOf(left));
                if (left > 0) warn();
                else if (inc.fromApp() && inc.simulated) confirmSimulated();
                else b.message.setText("Time is up. Waiting for the vest to send the alert…");
            }
            handler.postDelayed(this, 1000);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityCountdownBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        id = getIntent().getStringExtra(EXTRA_ID);
        vibrator = getSystemService(Vibrator.class);
        try { tone = new ToneGenerator(AudioManager.STREAM_ALARM, 90); } catch (RuntimeException e) { tone = null; }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { Ui.toast(CountdownActivity.this, "Tap CANCEL ALERT if you are OK."); }
        });
        b.cancelBtn.setOnClickListener(v -> cancel());

        track(Repo.incidentRef(id).addSnapshotListener((d, e) -> {
            if (d == null) return;
            inc = Incident.from(d);
            if (inc == null) { close(); return; }
            b.simLabel.setVisibility(inc.simulated ? View.VISIBLE : View.GONE);
            b.locationStatus.setText(inc.hasLocation()
                    ? String.format(java.util.Locale.US, "📍 Location found (%.4f, %.4f)", inc.latitude, inc.longitude)
                    : "📍 Location: searching…");
            if (inc.cancelRequested && inc.isPending()) b.message.setText("Cancel sent to your vest. Press the vest's CANCEL button to stop it instantly.");
            if (Incident.CANCELLED.equals(inc.status)) {
                Ui.toast(this, "Alert cancelled. No message was sent.");
                close();
            } else if (inc.isEmergency() || Incident.CLOSED.equals(inc.status)) {
                startActivity(new Intent(this, EmergencyActivity.class).putExtra(EmergencyActivity.EXTRA_ID, id));
                close();
            }
        }));
    }

    @Override protected void onResume() { super.onResume(); if (b != null) handler.post(tick); }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(tick); }

    @Override protected void onDestroy() {
        handler.removeCallbacks(tick);
        if (tone != null) tone.release();
        if (vibrator != null) vibrator.cancel();
        super.onDestroy();
    }

    private void close() {
        if (finishing) return;
        finishing = true;
        if (vibrator != null) vibrator.cancel();
        finish();
    }

    /** Buzzer + vibration every second: noisy traffic may hide one or the other. */
    private void warn() {
        if (tone != null) tone.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 400);
        if (vibrator != null && vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE));
    }

    private void cancel() {
        if (inc == null) return;
        b.cancelBtn.setEnabled(false);
        if (inc.fromApp() && inc.simulated) {
            Repo.cancelSimulated(id).addOnFailureListener(e -> {
                b.cancelBtn.setEnabled(true);
                // Most likely the alert was confirmed a moment earlier; the listener moves on to the emergency screen.
                Ui.toast(this, "Too late to cancel: the alert was already sent. You can report a false alarm on the next screen.");
            });
        } else {
            Repo.requestVestCancel(id)
                    .addOnSuccessListener(x -> {
                        b.message.setText("Cancel sent to your vest. Press the vest's CANCEL button to stop it instantly.");
                        b.cancelBtn.setEnabled(true);
                    })
                    .addOnFailureListener(e -> { b.cancelBtn.setEnabled(true); Ui.toast(this, Ui.error(e) + " Press the CANCEL button on your vest."); });
        }
    }

    /** Server clock decides: if the phone is slightly ahead, the rules refuse and we retry shortly. */
    private void confirmSimulated() {
        if (confirming || confirmTries >= MAX_CONFIRM_TRIES) return;
        confirming = true;
        confirmTries++;
        b.message.setText("Sending emergency alert…");
        b.cancelBtn.setEnabled(false);
        Repo.profileRef(Session.user().id).get().continueWithTask(pt ->
                Repo.confirmSimulated(id, pt.isSuccessful() && pt.getResult().exists() ? pt.getResult().getData() : null)
        ).addOnCompleteListener(t -> {
            if (t.isSuccessful()) return;      // listener opens the emergency screen
            Exception e = t.getException();
            boolean early = e instanceof FirebaseFirestoreException
                    && ((FirebaseFirestoreException) e).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED;
            handler.postDelayed(() -> confirming = false, early ? 1500 : 3000);
            if (confirmTries >= MAX_CONFIRM_TRIES) b.message.setText("Could not reach the server: " + Ui.error(e));
        });
    }
}
