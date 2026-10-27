package com.rideguard.app.ui;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.firebase.firestore.DocumentSnapshot;
import com.rideguard.app.R;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityCompanyHomeBinding;
import com.rideguard.app.model.Device;
import com.rideguard.app.model.Incident;
import com.rideguard.app.model.UserDoc;
import com.rideguard.app.notify.Notifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Company dashboard (14.2 + 14.3): counts, search, active emergencies first in red, vests with problems. */
public class CompanyHomeActivity extends BaseActivity {
    private ActivityCompanyHomeBinding b;
    private IncidentAdapter adapter;
    private final List<Incident> incidents = new ArrayList<>();
    private final List<UserDoc> users = new ArrayList<>();
    private final List<Device> devices = new ArrayList<>();
    private Map<String, String> lastStatus;      // null until first load, so old emergencies don't ring

    private final ActivityResultLauncher<String> notifPerm = registerForActivityResult(new ActivityResultContracts.RequestPermission(), r -> {});

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityCompanyHomeBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        UserDoc me = Session.user();
        b.hello.setText(me.name + " · " + (UserDoc.ADMIN.equals(me.role) ? "Administrator" : "Staff"));

        adapter = new IncidentAdapter(true, i -> startActivity(new Intent(this, IncidentDetailActivity.class).putExtra(IncidentDetailActivity.EXTRA_ID, i.id)));
        b.list.setLayoutManager(new LinearLayoutManager(this));
        b.list.setAdapter(adapter);
        b.search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int c, int d) {}
            @Override public void onTextChanged(CharSequence s, int a, int c, int d) {}
            @Override public void afterTextChanged(Editable s) { render(); }
        });
        b.historyBtn.setOnClickListener(v -> startActivity(new Intent(this, IncidentListActivity.class)));
        b.ridersBtn.setOnClickListener(v -> startActivity(new Intent(this, RidersActivity.class)));
        b.logoutBtn.setOnClickListener(v -> {
            Session.end();
            startActivity(new Intent(this, WelcomeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        });

        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != 0) {
            notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS);
        }

        track(Repo.companyIncidents(me.companyId).addSnapshotListener((qs, e) -> {
            if (e != null) { Ui.toast(this, Ui.error(e)); return; }
            incidents.clear();
            Map<String, String> now = new HashMap<>();
            for (DocumentSnapshot d : qs.getDocuments()) {
                Incident i = Incident.from(d);
                if (i == null) continue;
                incidents.add(i);
                now.put(i.id, i.status);
                if (lastStatus != null && Incident.CONFIRMED.equals(i.status) && !Incident.CONFIRMED.equals(lastStatus.get(i.id))) alarm(i);
            }
            lastStatus = now;
            render();
        }));
        track(Repo.companyUsers(me.companyId).addSnapshotListener((qs, e) -> {
            if (qs == null) return;
            users.clear();
            for (DocumentSnapshot d : qs.getDocuments()) users.add(UserDoc.from(d));
            render();
        }));
        track(Repo.companyDevices(me.companyId).addSnapshotListener((qs, e) -> {
            if (qs == null) return;
            devices.clear();
            for (DocumentSnapshot d : qs.getDocuments()) devices.add(Device.from(d));
            render();
        }));
    }

    /** New emergency while the app is open: sound, vibration, notification and a dialog that opens it. */
    private void alarm(Incident i) {
        String title = "Emergency" + (i.simulated ? " (simulation)" : "") + ": " + (i.riderName != null ? i.riderName : "rider");
        Notifier.emergency(this, i.id, title, (i.isSos() ? "Manual SOS" : "Accident detected") + " · tap to respond");
        Vibrator v = getSystemService(Vibrator.class);
        if (v != null) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 600, 300, 600, 300, 600}, -1));
        new MaterialAlertDialogBuilder(this).setTitle("⚠ " + title)
                .setMessage((i.isSos() ? "Manual SOS" : "Accident detected") + " at " + Labels.time(i.createdAt) + ".")
                .setPositiveButton("Open emergency", (d, w) -> startActivity(new Intent(this, IncidentDetailActivity.class).putExtra(IncidentDetailActivity.EXTRA_ID, i.id)))
                .setNegativeButton("Later", null).show();
    }

    private void render() {
        long now = System.currentTimeMillis();
        String q = Ui.str(b.search.getText()).toLowerCase(Locale.ROOT);
        List<Incident> shown = new ArrayList<>();
        int active = 0;
        for (Incident i : incidents) {
            if (i.isActive()) active++;
            boolean match = !q.isEmpty() && (i.id.toLowerCase(Locale.ROOT).contains(q) || (i.riderName != null && i.riderName.toLowerCase(Locale.ROOT).contains(q)));
            if (q.isEmpty() ? i.isActive() : match) shown.add(i);
        }
        // Unacknowledged emergencies first, then acknowledged, then countdowns, then the rest (search results).
        shown.sort((x, y) -> rank(x) != rank(y) ? Integer.compare(rank(x), rank(y)) : Long.compare(y.createdMs(), x.createdMs()));
        adapter.submit(shown);
        b.listTitle.setText(q.isEmpty() ? "Active emergencies" : "Search results");
        b.empty.setVisibility(shown.isEmpty() ? View.VISIBLE : View.GONE);
        b.empty.setText(q.isEmpty() ? "✔ No active emergencies." : "No rider or incident matches.");

        int riders = 0;
        for (UserDoc u : users) if (u != null && u.isRider() && u.isActive()) riders++;
        int online = 0, total = 0;
        StringBuilder problems = new StringBuilder();
        for (Device d : devices) {
            if (d == null || !d.active) continue;
            total++;
            List<String> p = new ArrayList<>();
            if (d.online(now)) online++; else p.add("offline");
            for (String[] k : new String[][]{{"imu", "motion sensor"}, {"frontCamera", "front camera"}, {"rearCamera", "rear camera"}, {"lte", "4G"}, {"gnss", "GPS"}}) {
                String v = d.part(k[0]);
                if (d.online(now) && v != null && !"ok".equals(v)) p.add(k[1] + ": " + v);
            }
            Integer bat = d.battery();
            if (d.online(now) && bat != null && bat < 20) p.add("battery " + bat + "%");
            if (!p.isEmpty()) problems.append("⚠ ").append(d.name()).append(" – ").append(String.join(", ", p)).append('\n');
        }
        b.statActive.setText(String.valueOf(active));
        b.statActive.setTextColor(ContextCompat.getColor(this, active > 0 ? R.color.red : R.color.green));
        b.statRiders.setText(String.valueOf(riders));
        b.statVests.setText(online + " / " + total);
        b.statProblems.setText(String.valueOf(problems.length() == 0 ? 0 : problems.toString().split("\n").length));
        b.problems.setText(problems.length() == 0 ? "✔ All vests healthy." : problems.toString().trim());
    }

    private static int rank(Incident i) {
        if (Incident.CONFIRMED.equals(i.status)) return 0;
        if (Incident.ACKNOWLEDGED.equals(i.status)) return 1;
        if (i.isPending()) return 2;
        return 3;
    }
}
