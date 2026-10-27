package com.rideguard.app.model;

import com.google.firebase.Timestamp;
import com.google.firebase.firestore.DocumentSnapshot;
import java.util.Map;

/** devices/{id}: a vest. status is reported by the vest's heartbeat through Cloud Functions. */
public class Device {
    public static final long ONLINE_MS = 2 * 60 * 1000L;

    public String id, label, riderId, companyId;
    public boolean active = true;
    public Timestamp lastSeenAt;
    public Map<String, Object> status;

    public static Device from(DocumentSnapshot d) {
        if (d == null || !d.exists()) return null;
        Device v = new Device();
        v.id = d.getId();
        v.label = d.getString("label");
        v.riderId = d.getString("riderId");
        v.companyId = d.getString("companyId");
        v.active = !Boolean.FALSE.equals(d.getBoolean("active"));
        v.lastSeenAt = d.getTimestamp("lastSeenAt");
        Object s = d.get("status");
        if (s instanceof Map) {
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) s;
            v.status = m;
        }
        return v;
    }

    public boolean online(long now) { return lastSeenAt != null && now - lastSeenAt.toDate().getTime() < ONLINE_MS; }

    public String part(String key) {
        Object o = status == null ? null : status.get(key);
        return o == null ? null : String.valueOf(o);
    }

    public Integer battery() {
        Object o = status == null ? null : status.get("battery");
        return o instanceof Number ? ((Number) o).intValue() : null;
    }

    public String name() { return label != null ? label : id; }
}
