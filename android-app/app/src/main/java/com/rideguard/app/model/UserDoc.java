package com.rideguard.app.model;

import com.google.firebase.firestore.DocumentSnapshot;

/** users/{uid}. Field names match docs/DATA_MODEL.md and the web dashboard. */
public class UserDoc {
    public static final String RIDER = "rider", STAFF = "company_staff", ADMIN = "company_admin";

    public String id, name, email, phone, role, companyId, status, riderNumber, deviceId;

    public static UserDoc from(DocumentSnapshot d) {
        if (d == null || !d.exists()) return null;
        UserDoc u = new UserDoc();
        u.id = d.getId();
        u.name = d.getString("name");
        u.email = d.getString("email");
        u.phone = d.getString("phone");
        u.role = d.getString("role");
        u.companyId = d.getString("companyId");
        u.status = d.getString("status");
        u.riderNumber = d.getString("riderNumber");
        u.deviceId = d.getString("deviceId");
        return u;
    }

    public boolean isRider() { return RIDER.equals(role); }
    public boolean isStaff() { return STAFF.equals(role) || ADMIN.equals(role); }
    public boolean isActive() { return "active".equals(status); }
    public boolean isPending() { return "pending".equals(status); }
}
