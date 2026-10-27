package com.rideguard.app.ui;

import com.rideguard.app.R;
import com.rideguard.app.model.Incident;
import java.text.DateFormat;
import java.util.Date;

/** Text + symbol labels so state never relies on colour alone. Same wording as the web dashboard. */
public final class Labels {
    private Labels() {}

    public static String status(String s) {
        if (s == null) return "Unknown";
        switch (s) {
            case Incident.PENDING: return "◔ Possible accident – countdown";
            case Incident.CONFIRMED: return "⚠ Emergency – needs response";
            case Incident.ACKNOWLEDGED: return "● Acknowledged – in progress";
            case Incident.CLOSED: return "■ Closed";
            case Incident.CANCELLED: return "✕ Cancelled – false alarm";
            default: return s;
        }
    }

    /** {text colour, background colour} for a status chip. */
    public static int[] statusColors(String s) {
        if (Incident.CONFIRMED.equals(s) || Incident.ACKNOWLEDGED.equals(s)) return new int[]{R.color.red, R.color.redBg};
        if (Incident.PENDING.equals(s)) return new int[]{R.color.amber, R.color.amberBg};
        return new int[]{R.color.grey, R.color.greyBg};
    }

    public static String sms(String s) {
        if (s == null) return "Unknown";
        switch (s) {
            case "accepted": return "Sent by vest (accepted by network)";
            case "delivered": return "Delivered";
            case "failed": return "Failed – vest is retrying";
            case "not_sent": return "Not sent (cancelled)";
            case "simulated": return "Simulated – no SMS sent";
            case "no_vest": return "Not sent – no vest. Use “Text contact” below.";
            case "pending": return "Sending…";
            default: return s;
        }
    }

    public static String video(String s) {
        if (s == null) return "No video (phone alert)";
        switch (s) {
            case "uploaded": return "Uploaded";
            case "uploading": return "Uploading…";
            case "pending": return "Waiting for upload";
            case "failed": return "Upload failed – vest will retry";
            case "none": return "Not recorded";
            default: return s;
        }
    }

    public static String company(String s) {
        if ("push_sent".equals(s)) return "Notified (push + dashboard)";
        if ("push_failed".equals(s)) return "Shown on dashboard (push failed)";
        if ("not_needed".equals(s)) return "Not needed";
        return "Shown on company dashboard";
    }

    public static String outcome(String o) {
        if (o == null) return "";
        switch (o) {
            case "rider_safe": return "Rider safe – no help needed";
            case "help_arrived": return "Help arrived on scene";
            case "hospital": return "Rider taken to hospital";
            case "false_alarm": return "False alarm";
            default: return "Other";
        }
    }

    public static final String[] OUTCOME_KEYS = {"rider_safe", "help_arrived", "hospital", "false_alarm", "other"};

    public static String time(com.google.firebase.Timestamp t) {
        return t == null ? "—" : DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(t.toDate());
    }

    public static String ago(com.google.firebase.Timestamp t, long now) {
        if (t == null) return "—";
        long s = Math.max(0, (now - t.toDate().getTime()) / 1000);
        if (s < 60) return s + "s ago";
        if (s < 3600) return (s / 60) + " min ago";
        if (s < 86400) return (s / 3600) + " h ago";
        return (s / 86400) + " d ago";
    }

    public static String shortDate(Date d) { return DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(d); }
}
