package com.rideguard.app.ui;

import android.os.Bundle;
import android.util.Patterns;
import android.view.View;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.FieldValue;
import com.rideguard.app.data.Fb;
import com.rideguard.app.data.Repo;
import com.rideguard.app.databinding.ActivityRegisterBinding;
import com.rideguard.app.model.UserDoc;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Rider self-registration with a company join code. The account stays "pending" until the company approves it. */
public class RegisterActivity extends BaseActivity {
    private ActivityRegisterBinding b;

    @Override protected boolean needsSession() { return false; }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        b = ActivityRegisterBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        HealthForm.setup(b.health);
        b.submitBtn.setOnClickListener(v -> submit());
    }

    private void error(String msg) {
        b.error.setText(msg);
        b.error.setVisibility(msg == null ? View.GONE : View.VISIBLE);
        if (msg != null) b.error.getParent().requestChildFocus(b.error, b.error);
    }

    private void busy(boolean on) {
        b.submitBtn.setEnabled(!on);
        b.progress.setVisibility(on ? View.VISIBLE : View.GONE);
    }

    private void submit() {
        String name = Ui.str(b.name.getText()), phone = Ui.str(b.phone.getText()), email = Ui.str(b.email.getText());
        String code = Ui.str(b.code.getText()).toUpperCase(Locale.ROOT), pw = b.password.getText() == null ? "" : b.password.getText().toString();
        b.nameLayout.setError(name.isEmpty() ? "Required" : null);
        b.phoneLayout.setError(phone.replaceAll("[^0-9]", "").length() < 7 ? "Enter a full phone number" : null);
        b.emailLayout.setError(Patterns.EMAIL_ADDRESS.matcher(email).matches() ? null : "Enter a valid email");
        b.codeLayout.setError(code.isEmpty() ? "Ask your company for its join code" : null);
        b.passwordLayout.setError(pw.length() < 8 ? "At least 8 characters" : null);
        if (b.nameLayout.getError() != null || b.phoneLayout.getError() != null || b.emailLayout.getError() != null
                || b.codeLayout.getError() != null || b.passwordLayout.getError() != null) { error("Please fix the highlighted fields."); return; }
        String healthErr = HealthForm.validate(b.health);
        if (healthErr != null) { error(healthErr); return; }
        if (!b.health.consent.isChecked()) { error("Consent is required so help can see your emergency contact and health details."); return; }

        error(null);
        busy(true);
        Fb.auth().createUserWithEmailAndPassword(email, pw).addOnSuccessListener(r -> {
            FirebaseUser fu = r.getUser();
            // The join code can only be read when signed in, so check it now; undo the account if it is wrong.
            Repo.lookupJoinCode(code).addOnCompleteListener(t -> {
                if (!t.isSuccessful() || !t.getResult().exists()) {
                    fu.delete();
                    busy(false);
                    b.codeLayout.setError("Unknown code");
                    error("That company join code is not valid. Check it with your company.");
                    return;
                }
                String companyId = t.getResult().getString("companyId");
                String companyName = t.getResult().getString("companyName");
                Map<String, Object> user = new HashMap<>();
                user.put("name", name);
                user.put("email", email.toLowerCase(Locale.ROOT));
                user.put("phone", phone);
                user.put("role", UserDoc.RIDER);
                user.put("companyId", companyId);
                user.put("status", "pending");
                user.put("joinCode", code);
                user.put("riderNumber", Ui.str(b.riderNumber.getText()));
                user.put("createdAt", FieldValue.serverTimestamp());
                Repo.registerRider(fu.getUid(), user, HealthForm.read(b.health, name))
                        .addOnSuccessListener(x -> {
                            Fb.auth().signOut();
                            new MaterialAlertDialogBuilder(this)
                                    .setTitle("Registration sent")
                                    .setMessage((companyName != null ? companyName : "Your company") + " must approve your account. "
                                            + "You can sign in once they have approved it.")
                                    .setCancelable(false)
                                    .setPositiveButton("OK", (d, w) -> finish()).show();
                        })
                        .addOnFailureListener(e -> { fu.delete(); busy(false); error(Ui.error(e)); });
            });
        }).addOnFailureListener(e -> { busy(false); error(Ui.error(e)); });
    }
}
