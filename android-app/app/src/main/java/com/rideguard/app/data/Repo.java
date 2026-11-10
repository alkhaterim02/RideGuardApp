package com.rideguard.app.data;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.firestore.CollectionReference;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.firestore.WriteBatch;
import com.rideguard.app.BuildConfig;
import com.rideguard.app.model.Incident;
import com.rideguard.app.model.UserDoc;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * All Firestore reads/writes. Every write here is also enforced by backend/firestore.rules,
 * so a bug in the app cannot bypass company isolation or the incident state machine.
 */
public final class Repo {
    private Repo() {}

    /** Profile fields copied into an incident's emergency snapshot (same list as Cloud Functions policy.js). */
    public static final List<String> SNAPSHOT_FIELDS = Arrays.asList("fullName", "age", "bloodType", "allergies",
            "conditions", "medication", "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone");

    private static CollectionReference col(String c) { return Fb.db().collection(c); }
    public static DocumentReference userRef(String uid) { return col("users").document(uid); }
    public static DocumentReference profileRef(String uid) { return col("riderProfiles").document(uid); }
    public static DocumentReference incidentRef(String id) { return col("incidents").document(id); }

    // ---------- ids ----------
    private static final SecureRandom RNG = new SecureRandom();
    private static final String ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static String newIncidentId() {
        StringBuilder b = new StringBuilder("INC-");
        for (int i = 0; i < 8; i++) b.append(ID_CHARS.charAt(RNG.nextInt(ID_CHARS.length())));
        return b.toString();
    }

    // ---------- account ----------
    public static Task<DocumentSnapshot> loadUser(String uid) { return userRef(uid).get(); }
    public static Task<DocumentSnapshot> loadCompany(String cid) { return col("companies").document(cid).get(); }
    public static Task<DocumentSnapshot> lookupJoinCode(String code) { return col("companyCodes").document(code).get(); }

    /** Rider self-registration: users doc (pending approval) + private health profile, written together. */
    public static Task<Void> registerRider(String uid, Map<String, Object> user, Map<String, Object> profile) {
        WriteBatch b = Fb.db().batch();
        b.set(userRef(uid), user);
        b.set(profileRef(uid), profile);
        return b.commit();
    }

    public static Task<Void> saveProfile(String uid, Map<String, Object> profile) {
        profile.put("updatedAt", FieldValue.serverTimestamp());
        return profileRef(uid).set(profile, SetOptions.merge());
    }

    public static Task<Void> updateMyContact(String uid, String name, String phone) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", name);
        m.put("phone", phone);
        m.put("updatedAt", FieldValue.serverTimestamp());
        return userRef(uid).update(m);
    }

    // ---------- rider incidents ----------
    private static Map<String, Object> baseIncident(UserDoc me, String id, Double lat, Double lng, boolean simulated) {
        Map<String, Object> m = new HashMap<>();
        m.put("incidentId", id);
        m.put("riderId", me.id);
        m.put("companyId", me.companyId);
        m.put("deviceId", me.deviceId);
        m.put("riderName", me.name);
        m.put("riderPhone", me.phone);
        m.put("source", "app");
        m.put("simulated", simulated);
        m.put("createdAt", FieldValue.serverTimestamp());
        m.put("latitude", lat);
        m.put("longitude", lng);
        m.put("locationLastKnown", lat == null ? null : Boolean.FALSE);
        m.put("locationUpdatedAt", lat == null ? null : FieldValue.serverTimestamp());
        m.put("companyNotified", "dashboard");
        m.put("updatedAt", FieldValue.serverTimestamp());
        return m;
    }

    /** A test countdown started from the app (the vest normally starts it). Always marked simulated. */
    public static Task<Void> startSimulatedAccident(UserDoc me, String id, Double lat, Double lng, long countdownSeconds) {
        Map<String, Object> m = baseIncident(me, id, lat, lng, true);
        m.put("status", Incident.PENDING);
        m.put("trigger", "auto");
        m.put("countdownSeconds", countdownSeconds);
        m.put("peakAccelG", 6.4);            // plausible simulated readings so the detail page has data
        m.put("peakRotationDps", 380.0);
        m.put("tiltDeg", 78.0);
        m.put("aiVerificationScore", 0.81);
        m.put("aiAssessment", "rider_down_likely");
        m.put("smsStatus", "pending");
        m.put("frontVideoUploadStatus", "none");
        return incidentRef(id).set(m);
    }

    /** Manual SOS from the phone: confirmed immediately, no countdown. Snapshot written in the same batch. */
    public static Task<Void> sendSos(UserDoc me, String id, Double lat, Double lng, boolean simulated, Map<String, Object> profile) {
        Map<String, Object> m = baseIncident(me, id, lat, lng, simulated);
        m.put("status", Incident.CONFIRMED);
        m.put("trigger", "sos");
        m.put("confirmedAt", FieldValue.serverTimestamp());
        m.put("smsStatus", simulated ? "simulated" : "no_vest");
        WriteBatch b = Fb.db().batch();
        b.set(incidentRef(id), m);
        putSnapshot(b, id, profile);
        return b.commit();
    }

    /** Countdown of a simulated incident ran out. Rules only allow this once the server clock passes the deadline. */
    public static Task<Void> confirmSimulated(String id, Map<String, Object> profile) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", Incident.CONFIRMED);
        m.put("confirmedAt", FieldValue.serverTimestamp());
        m.put("smsStatus", "simulated");
        m.put("updatedAt", FieldValue.serverTimestamp());
        WriteBatch b = Fb.db().batch();
        b.update(incidentRef(id), m);
        putSnapshot(b, id, profile);
        return b.commit();
    }

    private static void putSnapshot(WriteBatch b, String id, Map<String, Object> profile) {
        if (profile == null || !Boolean.TRUE.equals(profile.get("consentEmergencySharing"))) return;
        Map<String, Object> s = new HashMap<>();
        s.put("consentEmergencySharing", true);
        for (String k : SNAPSHOT_FIELDS) if (profile.get(k) != null) s.put(k, profile.get(k));
        b.set(incidentRef(id).collection("private").document("medical"), s);
    }

    public static Task<Void> cancelSimulated(String id) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", Incident.CANCELLED);
        m.put("cancelledAt", FieldValue.serverTimestamp());
        m.put("smsStatus", "not_sent");
        m.put("companyNotified", "not_needed");
        m.put("updatedAt", FieldValue.serverTimestamp());
        return incidentRef(id).update(m);
    }

    /** Real vest countdown: the vest picks this up on its next heartbeat (the physical button is instant). */
    public static Task<Void> requestVestCancel(String id) {
        return incidentRef(id).update("cancelRequested", true, "updatedAt", FieldValue.serverTimestamp());
    }

    public static Task<Void> reportFalseAlarm(String id) {
        return incidentRef(id).update("falseAlarmRequested", true, "updatedAt", FieldValue.serverTimestamp());
    }

    public static Task<Void> requestDeletion(String id) {
        return incidentRef(id).update("deletionRequested", true, "deletionRequestedAt", FieldValue.serverTimestamp(),
                "updatedAt", FieldValue.serverTimestamp());
    }

    public static Task<Void> updateLocation(String id, double lat, double lng) {
        Map<String, Object> m = new HashMap<>();
        m.put("latitude", lat);
        m.put("longitude", lng);
        m.put("locationLastKnown", false);
        m.put("locationUpdatedAt", FieldValue.serverTimestamp());
        m.put("updatedAt", FieldValue.serverTimestamp());
        return incidentRef(id).update(m);
    }

    public static Query riderIncidents(String uid) {
        return col("incidents").whereEqualTo("riderId", uid).orderBy("createdAt", Query.Direction.DESCENDING).limit(100);
    }

    /** Pending incidents for this rider (from the vest or a simulation) – opens the countdown screen. */
    public static Query riderPending(String uid) {
        return col("incidents").whereEqualTo("riderId", uid).whereEqualTo("status", Incident.PENDING);
    }

    public static Query riderDevice(String uid) { return col("devices").whereEqualTo("riderId", uid).limit(1); }

    // ---------- company ----------
    public static Query companyIncidents(String cid) {
        return col("incidents").whereEqualTo("companyId", cid).orderBy("createdAt", Query.Direction.DESCENDING).limit(300);
    }

    public static Query companyUsers(String cid) { return col("users").whereEqualTo("companyId", cid); }
    public static Query companyDevices(String cid) { return col("devices").whereEqualTo("companyId", cid); }

    public static Task<Void> acknowledge(String id, UserDoc me) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", Incident.ACKNOWLEDGED);
        m.put("acknowledgedBy", me.id);
        m.put("acknowledgedAt", FieldValue.serverTimestamp());
        m.put("updatedAt", FieldValue.serverTimestamp());
        return incidentRef(id).update(m);
    }

    public static Task<Void> close(String id, UserDoc me, String outcome, String note) {
        Map<String, Object> m = new HashMap<>();
        m.put("status", Incident.CLOSED);
        m.put("closedBy", me.id);
        m.put("closedAt", FieldValue.serverTimestamp());
        m.put("outcome", outcome);
        m.put("closeNote", note);
        m.put("updatedAt", FieldValue.serverTimestamp());
        return incidentRef(id).update(m);
    }

    public static Task<DocumentSnapshot> loadSnapshot(String incidentId) {
        return incidentRef(incidentId).collection("private").document("medical").get();
    }

    /** Company access to sensitive data is logged; an audit failure never blocks emergency work. */
    public static void audit(UserDoc me, String action, String incidentId, String riderId, String side, String detail) {
        if (me == null || !me.isStaff()) return;
        Map<String, Object> m = new HashMap<>();
        m.put("action", action);
        m.put("by", me.id);
        m.put("byName", me.name);
        m.put("companyId", me.companyId);
        m.put("at", FieldValue.serverTimestamp());
        if (incidentId != null) m.put("incidentId", incidentId);
        if (riderId != null) m.put("riderId", riderId);
        if (side != null) m.put("side", side);
        if (detail != null) m.put("detail", detail);
        col("auditLogs").add(m);
    }

    public static Task<Void> setRiderStatus(UserDoc me, UserDoc rider, String status) {
        audit(me, "rider_updated", null, rider.id, null, "status=" + status);
        return userRef(rider.id).update("status", status, "updatedAt", FieldValue.serverTimestamp());
    }

    /** Keeps users.deviceId and devices.riderId in step. */
    public static Task<Void> assignVest(UserDoc me, UserDoc rider, String deviceId, UserDoc previousHolder) {
        WriteBatch b = Fb.db().batch();
        if (rider.deviceId != null && !rider.deviceId.equals(deviceId)) {
            b.update(col("devices").document(rider.deviceId), "riderId", null, "updatedAt", FieldValue.serverTimestamp());
        }
        if (deviceId != null) {
            if (previousHolder != null && !previousHolder.id.equals(rider.id)) {
                b.update(userRef(previousHolder.id), "deviceId", null, "updatedAt", FieldValue.serverTimestamp());
            }
            b.update(col("devices").document(deviceId), "riderId", rider.id, "updatedAt", FieldValue.serverTimestamp());
        }
        b.update(userRef(rider.id), "deviceId", deviceId, "updatedAt", FieldValue.serverTimestamp());
        audit(me, "device_updated", null, rider.id, null, "vest=" + (deviceId == null ? "none" : deviceId));
        return b.commit();
    }

    /**
     * Creates the rider's Auth account on a throwaway FirebaseApp so the staff member stays signed in,
     * then writes the users doc as the staff member.
     */
    public static Task<String> addRider(UserDoc me, String name, String email, String phone, String riderNumber, String password) {
        FirebaseApp primary = FirebaseApp.getInstance();
        FirebaseOptions opts = primary.getOptions();
        FirebaseApp second = FirebaseApp.initializeApp(primary.getApplicationContext(), opts, "add-rider-" + System.currentTimeMillis());
        FirebaseAuth a2 = FirebaseAuth.getInstance(second);
        if (Fb.usingEmulators()) a2.useEmulator(BuildConfig.EMULATOR_HOST, 9099);
        return a2.createUserWithEmailAndPassword(email, password).continueWithTask(t -> {
            String uid = t.getResult().getUser().getUid();
            a2.signOut();
            Map<String, Object> u = new HashMap<>();
            u.put("name", name);
            u.put("email", email.toLowerCase());
            u.put("phone", phone);
            u.put("role", UserDoc.RIDER);
            u.put("companyId", me.companyId);
            u.put("status", "active");
            u.put("riderNumber", riderNumber);
            u.put("deviceId", null);
            u.put("createdAt", FieldValue.serverTimestamp());
            audit(me, "rider_added", null, uid, null, name);
            return userRef(uid).set(u).continueWith(x -> { x.getResult(); return uid; });
        }).addOnCompleteListener(t -> second.delete());
    }

    public static Task<Void> sendPasswordReset(String email) { return Fb.auth().sendPasswordResetEmail(email); }

    public static <T> Task<T> fail(String message) { return Tasks.forException(new IllegalStateException(message)); }
}
