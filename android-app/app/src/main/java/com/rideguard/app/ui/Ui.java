package com.rideguard.app.ui;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import com.google.firebase.FirebaseNetworkException;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException;
import com.google.firebase.auth.FirebaseAuthInvalidUserException;
import com.google.firebase.auth.FirebaseAuthUserCollisionException;
import com.google.firebase.auth.FirebaseAuthWeakPasswordException;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.storage.StorageException;
import java.util.Locale;

public final class Ui {
    private Ui() {}

    /** Clear, non-technical error messages (HCI requirement). */
    public static String error(Exception e) {
        if (e == null) return "Something went wrong.";
        if (e instanceof FirebaseNetworkException) return "No internet connection. Check mobile data and try again.";
        if (e instanceof FirebaseAuthInvalidCredentialsException || e instanceof FirebaseAuthInvalidUserException)
            return "Email or password is incorrect.";
        if (e instanceof FirebaseAuthUserCollisionException) return "An account with this email already exists.";
        if (e instanceof FirebaseAuthWeakPasswordException) return "Password is too weak. Use at least 8 characters.";
        if (e instanceof FirebaseAuthException && "ERROR_TOO_MANY_REQUESTS".equals(((FirebaseAuthException) e).getErrorCode()))
            return "Too many attempts. Wait a minute and try again.";
        if (e instanceof FirebaseFirestoreException) {
            switch (((FirebaseFirestoreException) e).getCode()) {
                case PERMISSION_DENIED: return "You are not allowed to do this (or it already changed).";
                case UNAVAILABLE: return "Server unreachable. It will retry when the connection returns.";
                case NOT_FOUND: return "Not found.";
                default: break;
            }
        }
        if (e instanceof StorageException) {
            int c = ((StorageException) e).getErrorCode();
            if (c == StorageException.ERROR_NOT_AUTHORIZED) return "You are not allowed to view this video.";
            if (c == StorageException.ERROR_OBJECT_NOT_FOUND) return "The video file was not found.";
        }
        return e.getMessage() != null ? e.getMessage() : "Something went wrong.";
    }

    public static void toast(Context c, String msg) { Toast.makeText(c, msg, Toast.LENGTH_LONG).show(); }

    public static void dial(Activity a, String phone) {
        if (phone == null || phone.trim().isEmpty()) { toast(a, "No phone number saved."); return; }
        a.startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone.replace(" ", ""))));
    }

    public static void sms(Activity a, String phone, String body) {
        Intent i = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + phone.replace(" ", ""))).putExtra("sms_body", body);
        try { a.startActivity(i); } catch (ActivityNotFoundException e) { toast(a, "No SMS app on this phone."); }
    }

    public static String mapsUrl(double lat, double lng) {
        return String.format(Locale.US, "https://www.google.com/maps/search/?api=1&query=%.6f,%.6f", lat, lng);
    }

    public static void directions(Activity a, double lat, double lng) {
        Uri u = Uri.parse(String.format(Locale.US, "https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", lat, lng));
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { toast(a, "No maps app installed."); }
    }

    public static void chip(TextView v, String text, int fgColor, int bgColor) {
        v.setText(text);
        v.setTextColor(ContextCompat.getColor(v.getContext(), fgColor));
        v.getBackground().mutate().setTint(ContextCompat.getColor(v.getContext(), bgColor));
    }

    public static String str(CharSequence s) { return s == null ? "" : s.toString().trim(); }
}
