package com.rideguard.app.notify;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.rideguard.app.R;
import com.rideguard.app.ui.IncidentDetailActivity;

public final class Notifier {
    private Notifier() {}

    public static final String EMERGENCIES = "emergencies";

    public static void createChannels(Context c) {
        NotificationChannel ch = new NotificationChannel(EMERGENCIES, "Rider emergencies", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Confirmed rider emergencies for company staff");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 600, 300, 600, 300, 600});
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    public static void emergency(Context c, String incidentId, String title, String body) {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && android.os.Build.VERSION.SDK_INT >= 33) return;
        Intent open = new Intent(c, IncidentDetailActivity.class).putExtra(IncidentDetailActivity.EXTRA_ID, incidentId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(c, incidentId.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, EMERGENCIES)
                .setSmallIcon(R.drawable.ic_shield)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setColor(ContextCompat.getColor(c, R.color.red))
                .setAutoCancel(true)
                .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(c).notify(incidentId.hashCode(), n.build());
        } catch (SecurityException ignored) { /* permission revoked meanwhile */ }
    }
}
