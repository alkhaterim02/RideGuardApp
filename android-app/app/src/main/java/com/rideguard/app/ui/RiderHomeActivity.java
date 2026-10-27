package com.rideguard.app.ui;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.firebase.firestore.DocumentSnapshot;
import com.rideguard.app.R;
import com.rideguard.app.data.Locator;
import com.rideguard.app.data.Prefs;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityRiderHomeBinding;
import com.rideguard.app.databinding.ItemStatusRowBinding;
import com.rideguard.app.model.Device;
import com.rideguard.app.model.Incident;
import com.rideguard.app.model.UserDoc;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Rider home (13.4): vest status in plain words, Start Ride, SOS, and the way into profile and history. */
public class RiderHomeActivity extends BaseActivity {
    private ActivityRiderHomeBinding b;
    private Device device;
    private Incident activeEmergency;
    private final Set<String> openedCountdowns = new HashSet<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() { renderVest(); handler.postDelayed(this, 10_000); }
    };

    private final ActivityResultLauncher<String[]> perms = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), r -> renderVest());

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityRiderHomeBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        UserDoc me = Session.user();
        b.hello.setText("Signed in as " + me.name);

        b.demoSwitch.setChecked(Prefs.demoMode(this));
        b.demoSwitch.setOnCheckedChangeListener((v, on) -> { Prefs.setDemoMode(this, on); renderVest(); });
        b.rideBtn.setOnClickListener(v -> { Prefs.setRiding(this, !Prefs.riding(this)); renderVest(); });
        b.sosBtn.setOnClickListener(v -> confirmSos());
        b.simBtn.setOnClickListener(v -> simulate());
        b.profileBtn.setOnClickListener(v -> startActivity(new Intent(this, HealthProfileActivity.class)));
        b.historyBtn.setOnClickListener(v -> startActivity(new Intent(this, IncidentListActivity.class)));
        b.emergencyBtn.setOnClickListener(v -> {
            if (activeEmergency != null) startActivity(new Intent(this, EmergencyActivity.class).putExtra(EmergencyActivity.EXTRA_ID, activeEmergency.id));
        });
        b.logoutBtn.setOnClickListener(v -> new MaterialAlertDialogBuilder(this).setTitle("Sign out?")
                .setMessage("The vest keeps protecting you and sends SMS alerts even when you are signed out of the app.")
                .setPositiveButton("Sign out", (d, w) -> {
                    Session.end();
                    startActivity(new Intent(this, WelcomeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
                }).setNegativeButton("Cancel", null).show());

        askPermissions();

        track(Repo.riderDevice(me.id).addSnapshotListener((qs, e) -> {
            device = qs == null || qs.isEmpty() ? null : Device.from(qs.getDocuments().get(0));
            renderVest();
        }));
        // A pending incident (from the vest or a test) opens the countdown screen automatically.
        track(Repo.riderPending(me.id).addSnapshotListener((qs, e) -> {
            if (qs == null) return;
            for (DocumentSnapshot d : qs.getDocuments()) {
                if (openedCountdowns.add(d.getId())) {
                    startActivity(new Intent(this, CountdownActivity.class).putExtra(CountdownActivity.EXTRA_ID, d.getId()));
                }
            }
        }));
        track(Repo.riderIncidents(me.id).limit(10).addSnapshotListener((qs, e) -> {
            activeEmergency = null;
            if (qs != null) for (DocumentSnapshot d : qs.getDocuments()) {
                Incident i = Incident.from(d);
                if (i != null && i.isEmergency()) { activeEmergency = i; break; }
            }
            renderEmergency();
            renderVest();
        }));
    }

    @Override protected void onResume() { super.onResume(); if (b != null) handler.post(refresh); }
    @Override protected void onPause() { super.onPause(); handler.removeCallbacks(refresh); }

    private void askPermissions() {
        boolean loc = Locator.permitted(this);
        boolean notif = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == 0;
        if (loc && notif) return;
        new MaterialAlertDialogBuilder(this).setTitle("Allow location and alerts")
                .setMessage("RideGuard uses your phone's location only when you send an SOS or an emergency is active, so help can find you. "
                        + "It never tracks normal rides.")
                .setPositiveButton("Continue", (d, w) -> perms.launch(Build.VERSION.SDK_INT >= 33
                        ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}
                        : new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}))
                .setNegativeButton("Not now", null).show();
    }

    private void renderEmergency() {
        b.emergencyCard.setVisibility(activeEmergency == null ? View.GONE : View.VISIBLE);
        if (activeEmergency != null) {
            b.emergencyText.setText(Labels.status(activeEmergency.status) + "\n" + Labels.time(activeEmergency.createdAt)
                    + (activeEmergency.simulated ? " · simulation" : ""));
        }
    }

    private void renderVest() {
        if (b == null) return;
        long now = System.currentTimeMillis();
        boolean demo = Prefs.demoMode(this);
        boolean online = device != null && device.active && device.online(now);
        boolean simulatedVest = demo && !online;            // demo: pretend a healthy vest when none is connected
        boolean riding = Prefs.riding(this);

        b.banner.setVisibility(demo ? View.VISIBLE : View.GONE);
        b.banner.setText(simulatedVest
                ? "DEMO MODE – no vest connected, so vest status below is simulated. Alerts are marked as simulations."
                : "DEMO MODE – alerts you send are marked as simulations.");

        b.statusRows.removeAllViews();
        if (device == null && !demo) {
            row("Vest", "No vest assigned", R.color.grey, R.color.greyBg);
        } else if (!online && !simulatedVest) {
            row("Vest", "○ Disconnected", R.color.grey, R.color.greyBg);
            row("Last seen", Labels.ago(device.lastSeenAt, now), R.color.grey, R.color.greyBg);
        } else {
            row("Vest", simulatedVest ? "✓ Connected (simulated)" : "✓ Connected", R.color.green, R.color.greenBg);
            row("Vest computer", "✓ Online", R.color.green, R.color.greenBg);
            Integer bat = simulatedVest ? Integer.valueOf(80) : device.battery();
            if (bat != null) row("Battery", bat + "%", bat < 20 ? R.color.red : bat < 40 ? R.color.amber : R.color.green, bat < 20 ? R.color.redBg : bat < 40 ? R.color.amberBg : R.color.greenBg);
            part("Motion sensor", simulatedVest ? "ok" : device.part("imu"));
            part("Front camera", simulatedVest ? "ok" : device.part("frontCamera"));
            part("Rear camera", simulatedVest ? "ok" : device.part("rearCamera"));
            part("Mobile data (4G)", simulatedVest ? "ok" : device.part("lte"));
            part("GPS location", simulatedVest ? "ok" : device.part("gnss"));
        }

        // Overall state: green ready, yellow checking, red emergency, grey disconnected (text + colour).
        int color; String title, text;
        if (activeEmergency != null) { color = R.color.red; title = "⚠ Emergency"; text = "Help has been alerted. Stay where you are if it is safe."; }
        else if (!online && !simulatedVest) { color = R.color.grey; title = "○ Vest disconnected"; text = "Switch the vest on. The SOS button below still alerts your company."; }
        else if (riding) { color = R.color.green; title = "✓ Ride active"; text = "Your vest is watching for accidents. Have a safe ride."; }
        else { color = R.color.green; title = "✓ Ready"; text = "Tap “Start ride” when you set off."; }
        String vestState = online && device != null ? device.part("state") : null;
        if (activeEmergency == null && vestState != null && (vestState.contains("possible") || vestState.contains("countdown"))) {
            color = R.color.amber; title = "◔ Checking…"; text = "The vest detected unusual movement and is checking.";
        }
        b.stateTitle.setText(title);
        b.stateTitle.setTextColor(ContextCompat.getColor(this, color));
        b.stateText.setText(text);
        b.rideBtn.setText(riding ? "End ride" : "Start ride");
    }

    private void part(String label, String v) {
        if (v == null) row(label, "Unknown", R.color.grey, R.color.greyBg);
        else if ("ok".equals(v)) row(label, "✓ OK", R.color.green, R.color.greenBg);
        else row(label, "✕ " + v, R.color.red, R.color.redBg);
    }

    private void row(String label, String value, int fg, int bg) {
        ItemStatusRowBinding r = ItemStatusRowBinding.inflate(getLayoutInflater(), b.statusRows, true);
        r.label.setText(label);
        Ui.chip(r.value, value, fg, bg);
    }

    private void confirmSos() {
        boolean demo = Prefs.demoMode(this);
        new MaterialAlertDialogBuilder(this)
                .setTitle("Send emergency alert now?")
                .setMessage(demo ? "Demo mode is on: your company sees this as a SIMULATION." : "Your company is alerted immediately with your location.")
                .setPositiveButton("Send alert", (d, w) -> sendSos(demo))
                .setNegativeButton("Cancel", null).show();
    }

    private void sendSos(boolean demo) {
        UserDoc me = Session.user();
        String id = Repo.newIncidentId();
        b.sosBtn.setEnabled(false);
        b.sosBtn.setText("Sending…");
        // Location and profile are best-effort: the alert goes out even without them.
        Locator.current(this).continueWithTask(lt -> Repo.profileRef(me.id).get().continueWithTask(pt -> {
            Map<String, Object> profile = pt.isSuccessful() && pt.getResult().exists() ? pt.getResult().getData() : null;
            Double lat = lt.getResult() == null ? null : lt.getResult().getLatitude();
            Double lng = lt.getResult() == null ? null : lt.getResult().getLongitude();
            return Repo.sendSos(me, id, lat, lng, demo, profile);
        })).addOnCompleteListener(t -> {
            b.sosBtn.setEnabled(true);
            b.sosBtn.setText("SOS\nSend emergency alert");
            if (t.isSuccessful()) startActivity(new Intent(this, EmergencyActivity.class).putExtra(EmergencyActivity.EXTRA_ID, id));
            else new MaterialAlertDialogBuilder(this).setTitle("Alert could not be sent")
                    .setMessage(Ui.error(t.getException()) + "\n\nIf you need help now, call emergency services.")
                    .setPositiveButton("Try again", (d, w) -> sendSos(demo))
                    .setNegativeButton("Close", null).show();
        });
    }

    private void simulate() {
        UserDoc me = Session.user();
        String id = Repo.newIncidentId();
        b.simBtn.setEnabled(false);
        Locator.current(this).continueWithTask(lt -> Repo.startSimulatedAccident(me, id,
                        lt.getResult() == null ? null : lt.getResult().getLatitude(),
                        lt.getResult() == null ? null : lt.getResult().getLongitude(), Session.countdownSeconds()))
                .addOnCompleteListener(t -> {
                    b.simBtn.setEnabled(true);
                    if (!t.isSuccessful()) Ui.toast(this, Ui.error(t.getException()));
                    // The pending-incident listener opens the countdown screen.
                });
    }
}
