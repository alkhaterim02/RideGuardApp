package com.rideguard.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.RadioButton;
import androidx.appcompat.app.AlertDialog;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.firebase.firestore.DocumentSnapshot;
import com.rideguard.app.R;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityIncidentDetailBinding;
import com.rideguard.app.databinding.DialogCloseIncidentBinding;
import com.rideguard.app.model.Incident;
import com.rideguard.app.model.UserDoc;
import java.util.Locale;

/**
 * Incident details. Rider (13.9): map, sensor summary, videos, deletion request.
 * Company (14.4): plus rider/contact/health (active emergencies only, audited), call buttons, acknowledge and close.
 */
public class IncidentDetailActivity extends BaseActivity {
    public static final String EXTRA_ID = "incident_id";
    private ActivityIncidentDetailBinding b;
    private String id;
    private Incident inc;
    private UserDoc me;
    private DocumentSnapshot snapshot;
    private boolean snapshotLoading, viewLogged;
    private String riderPhone;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityIncidentDetailBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        id = getIntent().getStringExtra(EXTRA_ID);
        me = Session.user();
        MapHelper.setup(b.map);

        b.ackBtn.setOnClickListener(v -> run(Repo.acknowledge(id, me), "Acknowledged. The rider can see that help is coming."));
        b.closeBtn.setOnClickListener(v -> askClose());
        b.callRiderBtn.setOnClickListener(v -> Ui.dial(this, riderPhone));
        b.callContactBtn.setOnClickListener(v -> Ui.dial(this, snapshot == null ? null : snapshot.getString("emergencyContactPhone")));
        b.directionsBtn.setOnClickListener(v -> { if (inc != null && inc.hasLocation()) Ui.directions(this, inc.latitude, inc.longitude); });
        b.frontBtn.setOnClickListener(v -> play("front"));
        b.rearBtn.setOnClickListener(v -> play("rear"));
        b.deleteBtn.setOnClickListener(v -> new MaterialAlertDialogBuilder(this)
                .setTitle("Request deletion?")
                .setMessage("Your company will be asked to delete this record and its videos, as allowed by its privacy policy and the law.")
                .setPositiveButton("Request deletion", (d, w) -> run(Repo.requestDeletion(id), "Deletion requested."))
                .setNegativeButton("Cancel", null).show());

        track(Repo.incidentRef(id).addSnapshotListener((d, e) -> {
            if (e != null) { b.title.setText("Not available"); b.sub.setText(Ui.error(e)); return; }
            inc = Incident.from(d);
            if (inc == null) { b.title.setText("Incident not found"); return; }
            if (me.isStaff() && !viewLogged) { viewLogged = true; Repo.audit(me, "incident_view", id, inc.riderId, null, null); }
            if (me.isStaff() && riderPhone == null) {
                riderPhone = inc.riderPhone;
                Repo.loadUser(inc.riderId).addOnSuccessListener(u -> { if (u.getString("phone") != null) riderPhone = u.getString("phone"); });
            }
            maybeLoadSnapshot();
            render();
        }));
    }

    @Override protected void onResume() { super.onResume(); if (b != null) b.map.onResume(); }
    @Override protected void onPause() { super.onPause(); if (b != null) b.map.onPause(); }

    /** Emergency contact + health: only for staff during an active emergency; every read is audited. */
    private void maybeLoadSnapshot() {
        if (!me.isStaff() || !inc.isEmergency() || snapshot != null || snapshotLoading) return;
        snapshotLoading = true;
        Repo.audit(me, "medical_access", id, inc.riderId, null, null);
        Repo.loadSnapshot(id).addOnCompleteListener(t -> {
            snapshotLoading = false;
            snapshot = t.isSuccessful() ? t.getResult() : null;
            render();
        });
    }

    private void render() {
        if (inc == null) return;
        boolean staff = me.isStaff();
        int[] c = Labels.statusColors(inc.status);
        Ui.chip(b.state, Labels.status(inc.status), c[0], c[1]);
        b.head.setBackgroundResource(inc.isEmergency() ? R.drawable.card_urgent : inc.isPending() ? R.drawable.card_warn : R.drawable.card_normal);
        b.title.setText(staff ? (inc.riderName != null ? inc.riderName : "Unknown rider") : (inc.isSos() ? "Manual SOS" : "Accident alert"));
        b.sub.setText(inc.id + " · " + Labels.time(inc.createdAt) + (inc.isSos() ? " · 🆘 manual SOS" : "") + (inc.fromApp() ? " · from phone" : ""));

        StringBuilder banner = new StringBuilder();
        if (inc.simulated) banner.append("SIMULATION – created for testing. No real SMS was sent.");
        if (inc.falseAlarmRequested) banner.append(banner.length() > 0 ? "\n" : "").append("The rider reported a false alarm after the alert was sent.");
        if (inc.deletionRequested) banner.append(banner.length() > 0 ? "\n" : "").append("Deletion of this record has been requested.");
        b.banner.setVisibility(banner.length() > 0 ? View.VISIBLE : View.GONE);
        b.banner.setText(banner);

        // Company actions
        b.companyActions.setVisibility(staff && inc.isEmergency() ? View.VISIBLE : View.GONE);
        b.ackBtn.setVisibility(Incident.CONFIRMED.equals(inc.status) ? View.VISIBLE : View.GONE);
        String contactPhone = snapshot == null ? null : snapshot.getString("emergencyContactPhone");
        b.callContactBtn.setEnabled(contactPhone != null);

        // Location
        if (inc.hasLocation()) {
            b.location.setText(String.format(Locale.US, "%.5f, %.5f%s%s", inc.latitude, inc.longitude,
                    inc.locationLastKnown ? " · last known position" : "",
                    inc.locationUpdatedAt != null ? "\nUpdated " + Labels.ago(inc.locationUpdatedAt, System.currentTimeMillis()) : ""));
            b.map.setVisibility(View.VISIBLE);
            b.directionsBtn.setVisibility(View.VISIBLE);
            MapHelper.show(b.map, inc.latitude, inc.longitude, inc.riderName);
        } else {
            b.location.setText("Location pending – the vest keeps requesting a GPS fix.");
            b.map.setVisibility(View.GONE);
            b.directionsBtn.setVisibility(View.GONE);
        }

        // Rider / contact / health (company only)
        b.peopleCard.setVisibility(staff ? View.VISIBLE : View.GONE);
        if (staff) {
            StringBuilder p = new StringBuilder();
            p.append("Rider: ").append(nz(inc.riderName)).append("\nPhone: ").append(nz(riderPhone)).append("\nVest: ").append(inc.deviceId == null ? "none (phone alert)" : inc.deviceId);
            if (!inc.isEmergency()) p.append("\n\nContact and health details are shown only while the emergency is active.");
            else if (snapshotLoading) p.append("\n\nLoading emergency details…");
            else if (snapshot == null || !snapshot.exists()) p.append("\n\nNo emergency details shared (no consent or no profile).");
            else {
                p.append("\n\nEMERGENCY CONTACT\n").append(nz(snapshot.getString("emergencyContactName")));
                String rel = snapshot.getString("emergencyContactRelationship");
                if (rel != null && !rel.isEmpty()) p.append(" (").append(rel).append(")");
                p.append("\n").append(nz(contactPhone));
                p.append("\n\nHEALTH (viewing is logged)\nBlood type: ").append(nz(snapshot.getString("bloodType")))
                        .append("\nAllergies: ").append(nz(snapshot.getString("allergies")))
                        .append("\nConditions: ").append(nz(snapshot.getString("conditions")))
                        .append("\nMedication: ").append(nz(snapshot.getString("medication")));
                Long age = snapshot.getLong("age");
                if (age != null) p.append("\nAge: ").append(age);
            }
            b.people.setText(p);
        }

        // Alerts + timeline
        StringBuilder a = new StringBuilder();
        a.append("Emergency SMS: ").append(Labels.sms(inc.smsStatus)).append("\nCompany: ").append(Labels.company(inc.companyNotified)).append("\n");
        a.append("\n• ").append(inc.isSos() ? "SOS pressed" : "Possible accident detected").append(" – ").append(Labels.time(inc.createdAt));
        if (inc.cancelledAt != null || Incident.CANCELLED.equals(inc.status)) a.append("\n• Cancelled by rider – no alert sent – ").append(Labels.time(inc.cancelledAt));
        if (inc.confirmedAt != null) a.append("\n• Emergency confirmed, alert sent – ").append(Labels.time(inc.confirmedAt));
        if (inc.acknowledgedAt != null) a.append("\n• Acknowledged by company – ").append(Labels.time(inc.acknowledgedAt));
        if (inc.closedAt != null) a.append("\n• Closed: ").append(Labels.outcome(inc.outcome)).append(" – ").append(Labels.time(inc.closedAt));
        if (inc.closeNote != null && !inc.closeNote.isEmpty()) a.append("\n“").append(inc.closeNote).append("”");
        b.alerts.setText(a);

        // Sensors
        if (inc.isSos() && inc.peakAccelG == null) b.sensors.setText("Manual SOS – not triggered by the motion sensor.");
        else b.sensors.setText(String.format(Locale.US, "Peak impact: %s\nPeak rotation: %s\nTilt after impact: %s\nAI check: %s",
                inc.peakAccelG == null ? "—" : String.format(Locale.US, "%.1f g", inc.peakAccelG),
                inc.peakRotationDps == null ? "—" : String.format(Locale.US, "%.0f °/s", inc.peakRotationDps),
                inc.tiltDeg == null ? "—" : String.format(Locale.US, "%.0f°", inc.tiltDeg),
                inc.aiVerificationScore == null ? "not available" : String.format(Locale.US, "%.0f%% likely accident", inc.aiVerificationScore * 100)));

        // Videos
        b.frontStatus.setText("Front camera: " + Labels.video(inc.frontVideoUploadStatus));
        b.rearStatus.setText("Rear camera: " + Labels.video(inc.rearVideoUploadStatus));
        b.frontBtn.setVisibility("uploaded".equals(inc.frontVideoUploadStatus) && inc.frontVideoPath != null ? View.VISIBLE : View.GONE);
        b.rearBtn.setVisibility("uploaded".equals(inc.rearVideoUploadStatus) && inc.rearVideoPath != null ? View.VISIBLE : View.GONE);

        b.deleteBtn.setVisibility(!staff && !inc.isActive() && !inc.deletionRequested ? View.VISIBLE : View.GONE);
    }

    private static String nz(String s) { return s == null || s.isEmpty() ? "—" : s; }

    private void play(String side) {
        String path = "front".equals(side) ? inc.frontVideoPath : inc.rearVideoPath;
        if (path == null) return;
        Repo.audit(me, "video_access", id, inc.riderId, side, null);
        startActivity(new Intent(this, VideoActivity.class).putExtra(VideoActivity.EXTRA_PATH, path)
                .putExtra(VideoActivity.EXTRA_TITLE, ("front".equals(side) ? "Front" : "Rear") + " video – " + id)
                .putExtra(VideoActivity.EXTRA_ALLOW_SAVE, !me.isStaff()));
    }

    private void run(com.google.android.gms.tasks.Task<Void> t, String ok) {
        t.addOnSuccessListener(x -> Ui.toast(this, ok)).addOnFailureListener(e -> Ui.toast(this, Ui.error(e)));
    }

    /** Closing an active emergency needs an outcome and an explicit second confirmation (HCI requirement). */
    private void askClose() {
        DialogCloseIncidentBinding d = DialogCloseIncidentBinding.inflate(getLayoutInflater());
        for (int k = 0; k < Labels.OUTCOME_KEYS.length; k++) {
            RadioButton r = new RadioButton(this);
            r.setId(View.generateViewId());
            r.setTag(Labels.OUTCOME_KEYS[k]);
            r.setText(Labels.outcome(Labels.OUTCOME_KEYS[k]));
            r.setMinHeight((int) (48 * getResources().getDisplayMetrics().density));
            r.setTextSize(16);
            d.outcomes.addView(r);
        }
        AlertDialog dlg = new MaterialAlertDialogBuilder(this)
                .setTitle("Close this active emergency?")
                .setView(d.getRoot())
                .setPositiveButton("Yes, close incident", null)
                .setNegativeButton("Keep open", null)
                .create();
        dlg.setOnShowListener(x -> dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            View sel = d.outcomes.findViewById(d.outcomes.getCheckedRadioButtonId());
            if (sel == null) { Ui.toast(this, "Choose what happened first."); return; }
            dlg.dismiss();
            run(Repo.close(id, me, (String) sel.getTag(), Ui.str(d.note.getText())), "Incident closed.");
        }));
        dlg.show();
    }
}
