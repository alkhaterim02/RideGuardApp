package com.rideguard.app.ui;

import android.widget.ArrayAdapter;
import com.google.firebase.firestore.FieldValue;
import com.rideguard.app.databinding.HealthFieldsBinding;
import java.util.HashMap;
import java.util.Map;

/** Binds health_fields.xml to the riderProfiles/{uid} map (field names shared with Cloud Functions). */
final class HealthForm {
    private HealthForm() {}

    static final String[] BLOOD = {"Unknown", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"};

    static void setup(HealthFieldsBinding h) {
        h.bloodType.setAdapter(new ArrayAdapter<>(h.getRoot().getContext(), android.R.layout.simple_list_item_1, BLOOD));
    }

    static void fill(HealthFieldsBinding h, Map<String, Object> p) {
        if (p == null) return;
        h.contactName.setText(s(p.get("emergencyContactName")));
        h.contactRelationship.setText(s(p.get("emergencyContactRelationship")));
        h.contactPhone.setText(s(p.get("emergencyContactPhone")));
        Object age = p.get("age");
        h.age.setText(age == null ? "" : String.valueOf(((Number) age).intValue()));
        h.bloodType.setText(s(p.get("bloodType")), false);
        h.allergies.setText(s(p.get("allergies")));
        h.conditions.setText(s(p.get("conditions")));
        h.medication.setText(s(p.get("medication")));
        h.medicalNotes.setText(s(p.get("medicalNotes")));
        h.consent.setChecked(Boolean.TRUE.equals(p.get("consentEmergencySharing")));
    }

    /** Returns an error message, or null if the form is valid. */
    static String validate(HealthFieldsBinding h) {
        h.contactNameLayout.setError(null);
        h.contactPhoneLayout.setError(null);
        if (Ui.str(h.contactName.getText()).isEmpty()) { h.contactNameLayout.setError("Required"); return "Add an emergency contact name."; }
        String phone = Ui.str(h.contactPhone.getText());
        if (phone.replaceAll("[^0-9]", "").length() < 7) { h.contactPhoneLayout.setError("Enter a full phone number"); return "Add the emergency contact's phone number."; }
        return null;
    }

    static Map<String, Object> read(HealthFieldsBinding h, String fullName) {
        Map<String, Object> p = new HashMap<>();
        p.put("fullName", fullName);
        p.put("emergencyContactName", Ui.str(h.contactName.getText()));
        p.put("emergencyContactRelationship", Ui.str(h.contactRelationship.getText()));
        p.put("emergencyContactPhone", Ui.str(h.contactPhone.getText()));
        String age = Ui.str(h.age.getText());
        p.put("age", age.isEmpty() ? null : Long.parseLong(age));
        String blood = Ui.str(h.bloodType.getText());
        p.put("bloodType", blood.isEmpty() || "Unknown".equals(blood) ? null : blood);
        p.put("allergies", Ui.str(h.allergies.getText()));
        p.put("conditions", Ui.str(h.conditions.getText()));
        p.put("medication", Ui.str(h.medication.getText()));
        p.put("medicalNotes", Ui.str(h.medicalNotes.getText()));
        boolean consent = h.consent.isChecked();
        p.put("consentEmergencySharing", consent);
        p.put("consentAt", consent ? FieldValue.serverTimestamp() : null);
        return p;
    }

    private static String s(Object o) { return o == null ? "" : String.valueOf(o); }
}
