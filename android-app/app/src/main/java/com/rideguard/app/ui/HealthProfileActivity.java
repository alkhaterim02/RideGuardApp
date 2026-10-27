package com.rideguard.app.ui;

import android.os.Bundle;
import com.google.android.gms.tasks.Tasks;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.databinding.ActivityHealthProfileBinding;
import com.rideguard.app.model.UserDoc;

public class HealthProfileActivity extends BaseActivity {
    private ActivityHealthProfileBinding b;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityHealthProfileBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        HealthForm.setup(b.health);
        UserDoc me = Session.user();
        b.name.setText(me.name);
        b.phone.setText(me.phone);
        b.saveBtn.setEnabled(false);
        b.status.setText("Loading…");
        Repo.profileRef(me.id).get().addOnCompleteListener(t -> {
            b.saveBtn.setEnabled(true);
            b.status.setText("");
            if (t.isSuccessful() && t.getResult().exists()) HealthForm.fill(b.health, t.getResult().getData());
            else if (!t.isSuccessful()) b.status.setText(Ui.error(t.getException()));
        });
        b.saveBtn.setOnClickListener(v -> save());
    }

    private void save() {
        UserDoc me = Session.user();
        String name = Ui.str(b.name.getText()), phone = Ui.str(b.phone.getText());
        b.nameLayout.setError(name.isEmpty() ? "Required" : null);
        String err = name.isEmpty() ? "Enter your name." : HealthForm.validate(b.health);
        if (err != null) { b.status.setText(err); return; }
        b.saveBtn.setEnabled(false);
        b.status.setText("Saving…");
        Tasks.whenAll(Repo.saveProfile(me.id, HealthForm.read(b.health, name)), Repo.updateMyContact(me.id, name, phone))
                .addOnSuccessListener(x -> {
                    me.name = name;
                    me.phone = phone;
                    b.status.setText(b.health.consent.isChecked() ? "✔ Saved." : "✔ Saved. Note: without consent your company will not see these details in an emergency.");
                    b.saveBtn.setEnabled(true);
                })
                .addOnFailureListener(e -> { b.status.setText(Ui.error(e)); b.saveBtn.setEnabled(true); });
    }
}
