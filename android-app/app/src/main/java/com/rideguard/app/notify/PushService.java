package com.rideguard.app.notify;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Emergency pushes sent by the onIncidentWritten Cloud Function (Blaze plan) to topic company_<companyId>. */
public class PushService extends FirebaseMessagingService {
    @Override public void onMessageReceived(@NonNull RemoteMessage msg) {
        String id = msg.getData().get("incidentId");
        if (id == null) return;
        RemoteMessage.Notification n = msg.getNotification();
        Notifier.emergency(this, id, n != null && n.getTitle() != null ? n.getTitle() : "Rider emergency",
                n != null && n.getBody() != null ? n.getBody() : "Open RideGuard to respond.");
    }

    @Override public void onNewToken(@NonNull String token) { /* topic subscriptions survive token refresh */ }
}
