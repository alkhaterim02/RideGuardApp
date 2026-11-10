package com.rideguard.app.model;

import com.google.firebase.Timestamp;
import com.google.firebase.firestore.DocumentSnapshot;

/** incidents/{id}. Status flow: pending -> confirmed | cancelled; confirmed -> acknowledged -> closed. */
public class Incident {
    public static final String PENDING = "pending", CONFIRMED = "confirmed", ACKNOWLEDGED = "acknowledged",
            CLOSED = "closed", CANCELLED = "cancelled";

    public String id, riderId, companyId, deviceId, riderName, riderPhone, status, trigger, source, smsStatus,
            companyNotified, frontVideoUploadStatus, frontVideoPath,
            acknowledgedBy, closedBy, outcome, closeNote, aiAssessment;
    public boolean simulated, cancelRequested, falseAlarmRequested, deletionRequested, locationLastKnown;
    public Double latitude, longitude, peakAccelG, peakRotationDps, tiltDeg, aiVerificationScore;
    public long countdownSeconds = 20;
    public Timestamp createdAt, confirmedAt, cancelledAt, acknowledgedAt, closedAt, locationUpdatedAt;

    public static Incident from(DocumentSnapshot d) {
        if (d == null || !d.exists()) return null;
        DocumentSnapshot.ServerTimestampBehavior est = DocumentSnapshot.ServerTimestampBehavior.ESTIMATE;
        Incident i = new Incident();
        i.id = d.getId();
        i.riderId = d.getString("riderId");
        i.companyId = d.getString("companyId");
        i.deviceId = d.getString("deviceId");
        i.riderName = d.getString("riderName");
        i.riderPhone = d.getString("riderPhone");
        i.status = d.getString("status");
        i.trigger = d.getString("trigger");
        i.source = d.getString("source");
        i.smsStatus = d.getString("smsStatus");
        i.companyNotified = d.getString("companyNotified");
        i.frontVideoUploadStatus = d.getString("frontVideoUploadStatus");
        i.frontVideoPath = d.getString("frontVideoPath");
        i.acknowledgedBy = d.getString("acknowledgedBy");
        i.closedBy = d.getString("closedBy");
        i.outcome = d.getString("outcome");
        i.closeNote = d.getString("closeNote");
        i.aiAssessment = d.getString("aiAssessment");
        i.simulated = Boolean.TRUE.equals(d.getBoolean("simulated"));
        i.cancelRequested = Boolean.TRUE.equals(d.getBoolean("cancelRequested"));
        i.falseAlarmRequested = Boolean.TRUE.equals(d.getBoolean("falseAlarmRequested"));
        i.deletionRequested = Boolean.TRUE.equals(d.getBoolean("deletionRequested"));
        i.locationLastKnown = Boolean.TRUE.equals(d.getBoolean("locationLastKnown"));
        i.latitude = d.getDouble("latitude");
        i.longitude = d.getDouble("longitude");
        i.peakAccelG = d.getDouble("peakAccelG");
        i.peakRotationDps = d.getDouble("peakRotationDps");
        i.tiltDeg = d.getDouble("tiltDeg");
        i.aiVerificationScore = d.getDouble("aiVerificationScore");
        Long cs = d.getLong("countdownSeconds");
        if (cs != null) i.countdownSeconds = cs;
        i.createdAt = d.getTimestamp("createdAt", est);
        i.confirmedAt = d.getTimestamp("confirmedAt", est);
        i.cancelledAt = d.getTimestamp("cancelledAt", est);
        i.acknowledgedAt = d.getTimestamp("acknowledgedAt", est);
        i.closedAt = d.getTimestamp("closedAt", est);
        i.locationUpdatedAt = d.getTimestamp("locationUpdatedAt", est);
        return i;
    }

    public boolean isPending() { return PENDING.equals(status); }
    public boolean isEmergency() { return CONFIRMED.equals(status) || ACKNOWLEDGED.equals(status); }
    public boolean isActive() { return isPending() || isEmergency(); }
    public boolean isSos() { return "sos".equals(trigger); }
    public boolean fromApp() { return "app".equals(source); }
    public boolean hasLocation() { return latitude != null && longitude != null; }
    public long createdMs() { return createdAt == null ? System.currentTimeMillis() : createdAt.toDate().getTime(); }
    public long deadlineMs() { return createdMs() + countdownSeconds * 1000L; }
}
