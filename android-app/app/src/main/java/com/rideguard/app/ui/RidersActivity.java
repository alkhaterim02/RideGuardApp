package com.rideguard.app.ui;

import android.os.Bundle;
import android.util.Patterns;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.google.android.gms.tasks.Task;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.firebase.firestore.DocumentSnapshot;
import com.rideguard.app.R;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityRidersBinding;
import com.rideguard.app.databinding.DialogAddRiderBinding;
import com.rideguard.app.databinding.ItemRiderBinding;
import com.rideguard.app.model.Device;
import com.rideguard.app.model.UserDoc;
import java.util.ArrayList;
import java.util.List;

/** Rider management (14.5): approve registrations, add riders, assign vests, deactivate, reset passwords. */
public class RidersActivity extends BaseActivity {
    private ActivityRidersBinding b;
    private final List<UserDoc> riders = new ArrayList<>();
    private final List<Device> devices = new ArrayList<>();
    private final Adapter adapter = new Adapter();
    private UserDoc me;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityRidersBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        me = Session.user();
        b.list.setLayoutManager(new LinearLayoutManager(this));
        b.list.setAdapter(adapter);
        b.chips.setOnCheckedStateChangeListener((g, ids) -> render());
        b.addBtn.setOnClickListener(v -> addRider());

        track(Repo.companyUsers(me.companyId).addSnapshotListener((qs, e) -> {
            if (qs == null) { if (e != null) Ui.toast(this, Ui.error(e)); return; }
            riders.clear();
            for (DocumentSnapshot d : qs.getDocuments()) { UserDoc u = UserDoc.from(d); if (u != null && u.isRider()) riders.add(u); }
            riders.sort((x, y) -> String.valueOf(x.name).compareToIgnoreCase(String.valueOf(y.name)));
            render();
        }));
        track(Repo.companyDevices(me.companyId).addSnapshotListener((qs, e) -> {
            if (qs == null) return;
            devices.clear();
            for (DocumentSnapshot d : qs.getDocuments()) devices.add(Device.from(d));
            render();
        }));
    }

    private void render() {
        int chip = b.chips.getCheckedChipId();
        String want = chip == R.id.chipPending ? "pending" : chip == R.id.chipInactive ? "inactive" : "active";
        List<UserDoc> shown = new ArrayList<>();
        for (UserDoc u : riders) if (want.equals(u.status)) shown.add(u);
        adapter.submit(shown);
        b.empty.setVisibility(shown.isEmpty() ? View.VISIBLE : View.GONE);
        b.empty.setText("pending".equals(want) ? "No registrations waiting." : "No " + want + " riders.");
    }

    private Device deviceOf(UserDoc u) {
        if (u.deviceId == null) return null;
        for (Device d : devices) if (d.id.equals(u.deviceId)) return d;
        return null;
    }

    private void act(Task<?> t, String ok) {
        t.addOnSuccessListener(x -> Ui.toast(this, ok)).addOnFailureListener(e -> Ui.toast(this, Ui.error(e)));
    }

    private void showActions(UserDoc r) {
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        if (r.isPending()) {
            labels.add("✔ Approve registration"); actions.add(() -> act(Repo.setRiderStatus(me, r, "active"), r.name + " approved."));
            labels.add("✕ Reject registration"); actions.add(() -> act(Repo.setRiderStatus(me, r, "inactive"), r.name + " rejected."));
        }
        if (r.isActive()) {
            labels.add("Assign or change vest"); actions.add(() -> assignVest(r));
            labels.add("Deactivate rider"); actions.add(() -> new MaterialAlertDialogBuilder(this)
                    .setTitle("Deactivate " + r.name + "?")
                    .setMessage("They can no longer sign in and their vest is unassigned. Their incident history is kept.")
                    .setPositiveButton("Deactivate", (d, w) -> {
                        Task<Void> t = r.deviceId != null ? Repo.assignVest(me, r, null, null).continueWithTask(x -> Repo.setRiderStatus(me, r, "inactive"))
                                : Repo.setRiderStatus(me, r, "inactive");
                        act(t, r.name + " deactivated.");
                    }).setNegativeButton("Cancel", null).show());
        }
        if ("inactive".equals(r.status)) { labels.add("Re-activate rider"); actions.add(() -> act(Repo.setRiderStatus(me, r, "active"), r.name + " re-activated.")); }
        labels.add("📞 Call " + r.name); actions.add(() -> Ui.dial(this, r.phone));
        labels.add("Send password reset email"); actions.add(() -> act(Repo.sendPasswordReset(r.email), "Reset email sent to " + r.email + "."));
        new MaterialAlertDialogBuilder(this).setTitle(r.name)
                .setItems(labels.toArray(new String[0]), (d, w) -> actions.get(w).run())
                .setNegativeButton("Close", null).show();
    }

    private void assignVest(UserDoc r) {
        List<Device> free = new ArrayList<>();
        List<String> names = new ArrayList<>();
        names.add("No vest");
        free.add(null);
        for (Device d : devices) {
            if (d == null || !d.active) continue;
            if (d.riderId == null || d.riderId.equals(r.id)) { free.add(d); names.add(d.name() + (d.id.equals(r.deviceId) ? " (current)" : "")); }
        }
        new MaterialAlertDialogBuilder(this).setTitle("Vest for " + r.name)
                .setItems(names.toArray(new String[0]), (dlg, w) -> {
                    Device d = free.get(w);
                    act(Repo.assignVest(me, r, d == null ? null : d.id, null), d == null ? "Vest unassigned." : d.name() + " assigned to " + r.name + ".");
                }).setNegativeButton("Cancel", null).show();
    }

    private void addRider() {
        DialogAddRiderBinding d = DialogAddRiderBinding.inflate(getLayoutInflater());
        AlertDialog dlg = new MaterialAlertDialogBuilder(this).setTitle("Add a rider").setView(d.getRoot())
                .setPositiveButton("Add rider", null).setNegativeButton("Cancel", null).create();
        dlg.setOnShowListener(x -> dlg.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String name = Ui.str(d.name.getText()), email = Ui.str(d.email.getText()), phone = Ui.str(d.phone.getText()), pw = Ui.str(d.password.getText());
            String err = name.isEmpty() ? "Enter a name." : !Patterns.EMAIL_ADDRESS.matcher(email).matches() ? "Enter a valid email."
                    : phone.replaceAll("[^0-9]", "").length() < 7 ? "Enter a full phone number." : pw.length() < 8 ? "Password needs 8+ characters." : null;
            d.error.setVisibility(err == null ? View.GONE : View.VISIBLE);
            d.error.setText(err);
            if (err != null) return;
            v.setEnabled(false);
            Repo.addRider(me, name, email, phone, Ui.str(d.riderNumber.getText()), pw)
                    .addOnSuccessListener(uid -> { dlg.dismiss(); Ui.toast(this, name + " added. Share their email and temporary password."); })
                    .addOnFailureListener(e -> { v.setEnabled(true); d.error.setVisibility(View.VISIBLE); d.error.setText(Ui.error(e)); });
        }));
        dlg.show();
    }

    class Adapter extends RecyclerView.Adapter<Adapter.VH> {
        private final List<UserDoc> data = new ArrayList<>();

        void submit(List<UserDoc> items) { data.clear(); data.addAll(items); notifyDataSetChanged(); }

        @NonNull @Override public VH onCreateViewHolder(@NonNull ViewGroup p, int t) {
            return new VH(ItemRiderBinding.inflate(LayoutInflater.from(p.getContext()), p, false));
        }

        @Override public void onBindViewHolder(@NonNull VH h, int pos) {
            UserDoc r = data.get(pos);
            long now = System.currentTimeMillis();
            h.b.name.setText(r.name);
            if (r.isActive()) Ui.chip(h.b.status, "✓ Active", R.color.green, R.color.greenBg);
            else if (r.isPending()) Ui.chip(h.b.status, "◔ Awaiting approval", R.color.amber, R.color.amberBg);
            else Ui.chip(h.b.status, "■ Inactive", R.color.grey, R.color.greyBg);
            h.b.sub.setText((r.riderNumber != null && !r.riderNumber.isEmpty() ? r.riderNumber + " · " : "") + r.email + (r.phone != null ? "\n" + r.phone : ""));
            Device d = deviceOf(r);
            h.b.vest.setText(d == null ? "No vest assigned" : d.name() + (d.online(now) ? " · ● online" : " · ○ offline, seen " + Labels.ago(d.lastSeenAt, now)));
            h.b.card.setOnClickListener(v -> showActions(r));
        }

        @Override public int getItemCount() { return data.size(); }

        class VH extends RecyclerView.ViewHolder {
            final ItemRiderBinding b;
            VH(ItemRiderBinding b) { super(b.getRoot()); this.b = b; }
        }
    }
}
