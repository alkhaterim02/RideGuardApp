package com.rideguard.app.data;

import com.google.firebase.messaging.FirebaseMessaging;
import com.rideguard.app.model.UserDoc;

/** The signed-in user's profile, loaded once after login. */
public final class Session {
    private Session() {}

    private static UserDoc user;
    private static long countdownSeconds = 20;

    public static UserDoc user() { return user; }
    public static long countdownSeconds() { return countdownSeconds; }
    public static void setCountdownSeconds(long s) { countdownSeconds = Math.max(5, Math.min(60, s)); }

    public static void start(UserDoc u) {
        user = u;
        // Company staff get emergency pushes via topic (sent by the onIncidentWritten Cloud Function).
        if (u.isStaff() && !Fb.usingEmulators()) {
            FirebaseMessaging.getInstance().subscribeToTopic("company_" + u.companyId);
        }
    }

    public static void end() {
        if (user != null && user.isStaff() && !Fb.usingEmulators()) {
            FirebaseMessaging.getInstance().unsubscribeFromTopic("company_" + user.companyId);
        }
        user = null;
        Fb.auth().signOut();
    }
}
