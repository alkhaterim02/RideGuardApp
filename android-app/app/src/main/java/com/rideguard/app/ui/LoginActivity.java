package com.rideguard.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import com.rideguard.app.data.Fb;
import com.rideguard.app.data.Repo;
import com.rideguard.app.databinding.ActivityLoginBinding;

/** Shared by Rider login and Company login; the role is checked against users/{uid} after sign-in. */
public class LoginActivity extends BaseActivity {
    static final String EXTRA_RIDER = "rider";
    private ActivityLoginBinding b;
    private boolean rider;

    @Override protected boolean needsSession() { return false; }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        b = ActivityLoginBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        rider = getIntent().getBooleanExtra(EXTRA_RIDER, true);
        setTitle(rider ? "Rider login" : "Company login");
        b.heading.setText(rider ? "Rider login" : "Company login");
        b.emailLayout.setHint(rider ? "Email" : "Company email");
        b.registerBtn.setVisibility(rider ? View.VISIBLE : View.GONE);
        b.companyNote.setVisibility(rider ? View.GONE : View.VISIBLE);

        b.loginBtn.setOnClickListener(v -> login());
        b.forgotBtn.setOnClickListener(v -> forgot());
        b.registerBtn.setOnClickListener(v -> startActivity(new Intent(this, RegisterActivity.class)));
    }

    private void showError(String msg) {
        b.error.setText(msg);
        b.error.setVisibility(msg == null ? View.GONE : View.VISIBLE);
    }

    private void busy(boolean on) {
        b.loginBtn.setEnabled(!on);
        b.loginBtn.setText(on ? "Signing in…" : "Log in");
        b.progress.setVisibility(on ? View.VISIBLE : View.GONE);
    }

    private void login() {
        String email = Ui.str(b.email.getText()), pw = b.password.getText() == null ? "" : b.password.getText().toString();
        b.emailLayout.setError(email.isEmpty() ? "Enter your email" : null);
        b.passwordLayout.setError(pw.isEmpty() ? "Enter your password" : null);
        if (email.isEmpty() || pw.isEmpty()) return;
        showError(null);
        busy(true);
        Fb.auth().signInWithEmailAndPassword(email, pw)
                .addOnSuccessListener(r -> Router.afterSignIn(this, rider, msg -> { busy(false); showError(msg); }))
                .addOnFailureListener(e -> { busy(false); showError(Ui.error(e)); });
    }

    private void forgot() {
        String email = Ui.str(b.email.getText());
        if (email.isEmpty()) { b.emailLayout.setError("Type your email first, then tap “Forgot password”."); return; }
        Repo.sendPasswordReset(email)
                .addOnSuccessListener(x -> Ui.toast(this, "If that account exists, a reset link has been emailed."))
                .addOnFailureListener(e -> showError(Ui.error(e)));
    }
}
