package com.rideguard.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.google.firebase.firestore.DocumentSnapshot;
import com.rideguard.app.R;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityIncidentListBinding;
import com.rideguard.app.model.Incident;
import com.rideguard.app.model.UserDoc;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Rider: accident history (13.8). Company: emergency history with search and filters (14.6). */
public class IncidentListActivity extends BaseActivity {
    private ActivityIncidentListBinding b;
    private IncidentAdapter adapter;
    private final List<Incident> all = new ArrayList<>();
    private boolean company;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityIncidentListBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        UserDoc me = Session.user();
        company = me.isStaff();
        setTitle(company ? "Emergency history" : "Accident history");

        adapter = new IncidentAdapter(company, i -> startActivity(new Intent(this, IncidentDetailActivity.class).putExtra(IncidentDetailActivity.EXTRA_ID, i.id)));
        b.list.setLayoutManager(new LinearLayoutManager(this));
        b.list.setAdapter(adapter);
        b.chips.setOnCheckedStateChangeListener((g, ids) -> apply());
        b.search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int c, int d) {}
            @Override public void onTextChanged(CharSequence s, int a, int c, int d) {}
            @Override public void afterTextChanged(Editable s) { apply(); }
        });

        track((company ? Repo.companyIncidents(me.companyId) : Repo.riderIncidents(me.id)).addSnapshotListener((qs, e) -> {
            if (e != null) { b.empty.setVisibility(View.VISIBLE); b.empty.setText(Ui.error(e)); return; }
            all.clear();
            if (qs != null) for (DocumentSnapshot d : qs.getDocuments()) { Incident i = Incident.from(d); if (i != null) all.add(i); }
            apply();
        }));
    }

    private void apply() {
        String q = Ui.str(b.search.getText()).toLowerCase(Locale.ROOT);
        int chip = b.chips.getCheckedChipId();
        List<Incident> out = new ArrayList<>();
        for (Incident i : all) {
            if (chip == R.id.chipConfirmed && !(i.isEmergency() || Incident.CLOSED.equals(i.status))) continue;
            if (chip == R.id.chipCancelled && !Incident.CANCELLED.equals(i.status)) continue;
            if (chip == R.id.chipActive && !i.isActive()) continue;
            if (!q.isEmpty() && !(i.id.toLowerCase(Locale.ROOT).contains(q)
                    || (i.riderName != null && i.riderName.toLowerCase(Locale.ROOT).contains(q)))) continue;
            out.add(i);
        }
        adapter.submit(out);
        b.empty.setVisibility(out.isEmpty() ? View.VISIBLE : View.GONE);
        b.empty.setText(all.isEmpty() ? (company ? "No incidents yet." : "No accidents or alerts yet. Ride safe!") : "Nothing matches this filter.");
    }
}
