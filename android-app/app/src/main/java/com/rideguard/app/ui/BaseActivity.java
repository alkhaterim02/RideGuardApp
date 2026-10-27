package com.rideguard.app.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.MenuItem;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import com.google.firebase.firestore.ListenerRegistration;
import com.rideguard.app.data.Fb;
import com.rideguard.app.data.Session;
import java.util.ArrayList;
import java.util.List;

/** Back arrow, listener cleanup, and a guard that sends the user to login if the session is gone. */
public abstract class BaseActivity extends AppCompatActivity {
    private final List<ListenerRegistration> listeners = new ArrayList<>();

    /** Screens after login need a loaded Session (lost if Android killed the process). */
    protected boolean needsSession() { return true; }

    @Override protected void onCreate(@Nullable Bundle state) {
        super.onCreate(state);
        if (getSupportActionBar() != null && !isTaskRoot()) getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        if (needsSession() && (Session.user() == null || !Fb.isReady() || Fb.uid() == null)) {
            startActivity(new Intent(this, WelcomeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            finish();
        }
    }

    protected boolean sessionLost() { return Session.user() == null; }

    protected void track(ListenerRegistration r) { listeners.add(r); }

    protected void stopListening() {
        for (ListenerRegistration r : listeners) r.remove();
        listeners.clear();
    }

    @Override protected void onDestroy() { stopListening(); super.onDestroy(); }

    @Override public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == android.R.id.home) { getOnBackPressedDispatcher().onBackPressed(); return true; }
        return super.onOptionsItemSelected(item);
    }
}
