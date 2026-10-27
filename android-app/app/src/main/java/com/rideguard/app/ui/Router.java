package com.rideguard.app.ui;

import android.app.Activity;
import android.content.Intent;
import com.rideguard.app.data.Fb;
import com.rideguard.app.data.Repo;
import com.rideguard.app.data.Session;
import com.rideguard.app.model.UserDoc;

/** After Firebase sign-in: load users/{uid}, check role and status, open the right home screen. */
final class Router {
    private Router() {}

    interface Fail { void on(String message); }

    /** expectRider: null = accept either (auto-login), true = rider login, false = company login. */
    static void afterSignIn(Activity a, Boolean expectRider, Fail fail) {
        String uid = Fb.uid();
        if (uid == null) { fail.on("Not signed in."); return; }
        Repo.loadUser(uid).addOnSuccessListener(d -> {
            UserDoc u = UserDoc.from(d);
            String problem = null;
            if (u == null) problem = "This account has no RideGuard profile. Ask your company to add you.";
            else if (expectRider != null && expectRider && !u.isRider()) problem = "This is a company account. Use “Company login”.";
            else if (expectRider != null && !expectRider && !u.isStaff()) problem = "This is a rider account. Use “Rider login”.";
            else if (u.isPending()) problem = "Your registration is waiting for your company to approve it. Try again later.";
            else if (!u.isActive()) problem = "This account has been deactivated. Contact your company.";
            if (problem != null) { Fb.auth().signOut(); fail.on(problem); return; }
            Session.start(u);
            Repo.loadCompany(u.companyId).addOnCompleteListener(t -> {
                if (t.isSuccessful() && t.getResult().exists()) {
                    Long s = t.getResult().getLong("countdownSeconds");
                    if (s != null) Session.setCountdownSeconds(s);
                }
                Class<?> home = u.isRider() ? RiderHomeActivity.class : CompanyHomeActivity.class;
                a.startActivity(new Intent(a, home).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
                a.finish();
            });
        }).addOnFailureListener(e -> { Fb.auth().signOut(); fail.on(Ui.error(e)); });
    }
}
