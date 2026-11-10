package com.rideguard.app.ui;

import android.os.Bundle;
import android.view.View;
import androidx.core.content.ContextCompat;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.rideguard.app.R;
import com.rideguard.app.data.Locator;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityEmergencyBinding;
import com.rideguard.app.databinding.ItemStatusRowBinding;
import com.rideguard.app.model.Incident;
import java.util.Locale;

/** Emergency confirmed (13.7): what was sent to whom, location + map, call contact, update location. */
public class EmergencyActivity extends BaseActivity {
    static final String EXTRA_ID = "incident_id";
    private ActivityEmergencyBinding b;
    private String id, contactPhone, contactName;
    private Incident inc;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityEmergencyBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        id = getIntent().getStringExtra(EXTRA_ID);
        MapHelper.setup(b.map);

        Repo.profileRef(Session.user().id).get().addOnSuccessListener(p -> {
            contactPhone = p.getString("emergencyContactPhone");
            contactName = p.getString("emergencyContactName");
            b.callBtn.setText(contactName != null && !contactName.isEmpty() ? "📞 Call " + contactName : "📞 Call emergency contact");
            render();
        });
        b.callBtn.setOnClickListener(v -> Ui.dial(this, contactPhone));
        b.smsBtn.setOnClickListener(v -> {
            if (contactPhone == null || inc == null) { Ui.toast(this, "Add an emergency contact in your health profile."); return; }
            String where = inc.hasLocation() ? " Location: " + Ui.mapsUrl(inc.latitude, inc.longitude) : "";
            Ui.sms(this, contactPhone, "RideGuard emergency: " + Session.user().name + " needs help (incident " + id + ")." + where);
        });
        b.locBtn.setOnClickListener(v -> updateLocation());
        b.falseAlarmBtn.setOnClickListener(v -> new MaterialAlertDialogBuilder(this)
                .setTitle("Report a false alarm?")
                .setMessage("Your company will see that you are OK. Your emergency contact may already have received an SMS – consider calling them.")
                .setPositiveButton("Yes, I am OK", (d, w) -> Repo.reportFalseAlarm(id)
                        .addOnSuccessListener(x -> Ui.toast(this, "Reported. Your company will confirm with you."))
                        .addOnFailureListener(e -> Ui.toast(this, Ui.error(e))))
                .setNegativeButton("Cancel", null).show());
        b.homeBtn.setOnClickListener(v -> finish());

        track(Repo.incidentRef(id).addSnapshotListener((d, e) -> {
            if (d == null) return;
            inc = Incident.from(d);
            render();
        }));
    }

    @Override protected void onResume() { super.onResume(); if (b != null) b.map.onResume(); }
    @Override protected void onPause() { super.onPause(); if (b != null) b.map.onPause(); }

    private void render() {
        if (inc == null) return;
        boolean active = inc.isEmergency();
        b.banner.setVisibility(inc.simulated ? View.VISIBLE : View.GONE);
        b.banner.setText("SIMULATION – no real SMS was sent. Your company sees this marked as a simulation.");
        b.head.setBackgroundColor(ContextCompat.getColor(this, active ? R.color.red : R.color.grey));
        b.headline.setText(active ? (inc.simulated ? "Emergency alert sent (simulated)" : "Emergency alert sent") : Labels.status(inc.status));
        b.subline.setText((inc.isSos() ? "Manual SOS · " : "Accident detected · ") + Labels.time(inc.confirmedAt != null ? inc.confirmedAt : inc.createdAt)
                + "\nIncident " + inc.id + (Incident.ACKNOWLEDGED.equals(inc.status) ? "\n✔ Your company has seen this and is responding." : ""));

        b.rows.removeAllViews();
        row("Emergency contact SMS", Labels.sms(inc.smsStatus), smsGood(inc.smsStatus));
        row("Company", Incident.ACKNOWLEDGED.equals(inc.status) ? "✔ Acknowledged" : Labels.company(inc.companyNotified), true);
        row("Video", Labels.video(inc.frontVideoUploadStatus), "uploaded".equals(inc.frontVideoUploadStatus));
        b.smsBtn.setVisibility(contactPhone != null && ("no_vest".equals(inc.smsStatus) || "failed".equals(inc.smsStatus)) ? View.VISIBLE : View.GONE);

        if (inc.hasLocation()) {
            b.location.setText(String.format(Locale.US, "%.5f, %.5f%s%s", inc.latitude, inc.longitude,
                    inc.locationLastKnown ? " (last known)" : "",
                    inc.locationUpdatedAt != null ? "\nUpdated " + Labels.ago(inc.locationUpdatedAt, System.currentTimeMillis()) : ""));
            b.map.setVisibility(View.VISIBLE);
            MapHelper.show(b.map, inc.latitude, inc.longitude, "You");
        } else {
            b.location.setText("Location not available yet. Tap “Update my location”.");
            b.map.setVisibility(View.GONE);
        }
        b.locBtn.setVisibility(active ? View.VISIBLE : View.GONE);
        b.falseAlarmBtn.setVisibility(active && !inc.falseAlarmRequested ? View.VISIBLE : View.GONE);
    }

    private static boolean smsGood(String s) { return "accepted".equals(s) || "delivered".equals(s) || "simulated".equals(s); }

    private void row(String label, String value, boolean good) {
        ItemStatusRowBinding r = ItemStatusRowBinding.inflate(getLayoutInflater(), b.rows, true);
        r.label.setText(label);
        r.value.setMaxWidth(getResources().getDisplayMetrics().widthPixels / 2);
        Ui.chip(r.value, value, good ? R.color.green : R.color.amber, good ? R.color.greenBg : R.color.amberBg);
    }

    private void updateLocation() {
        if (!Locator.permitted(this)) { Ui.toast(this, "Allow location access for RideGuard in Settings."); return; }
        b.locBtn.setEnabled(false);
        b.locBtn.setText("Finding location…");
        Locator.current(this).addOnCompleteListener(t -> {
            b.locBtn.setEnabled(true);
            b.locBtn.setText("Update my location");
            if (t.getResult() == null) { Ui.toast(this, "Could not get a GPS fix. Try again outdoors."); return; }
            Repo.updateLocation(id, t.getResult().getLatitude(), t.getResult().getLongitude())
                    .addOnSuccessListener(x -> Ui.toast(this, "Location updated."))
                    .addOnFailureListener(e -> Ui.toast(this, Ui.error(e)));
        });
    }
}
