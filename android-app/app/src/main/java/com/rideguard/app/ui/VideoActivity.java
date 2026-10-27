package com.rideguard.app.ui;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import com.rideguard.app.data.Fb;
import com.rideguard.app.databinding.ActivityVideoBinding;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Plays one accident clip full screen. The file is downloaded through the Storage SDK (Storage rules are checked)
 * into app-private cache and deleted when the screen closes – no shareable public URL is created.
 */
public class VideoActivity extends BaseActivity {
    static final String EXTRA_PATH = "path", EXTRA_TITLE = "title", EXTRA_ALLOW_SAVE = "allow_save";
    private ActivityVideoBinding b;
    private ExoPlayer player;
    private File file;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (sessionLost()) return;
        b = ActivityVideoBinding.inflate(getLayoutInflater());
        setContentView(b.getRoot());
        String path = getIntent().getStringExtra(EXTRA_PATH);
        b.title.setText(getIntent().getStringExtra(EXTRA_TITLE));
        b.backBtn.setOnClickListener(v -> finish());
        b.saveBtn.setOnClickListener(v -> save());
        b.status.setText("Downloading video…");

        File dir = new File(getCacheDir(), "videos");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        file = new File(dir, path.replace('/', '_'));
        Fb.storage().getReference(path).getFile(file)
                .addOnProgressListener(s -> {
                    if (s.getTotalByteCount() > 0) b.status.setText("Downloading video… " + (100 * s.getBytesTransferred() / s.getTotalByteCount()) + "%");
                })
                .addOnSuccessListener(s -> start())
                .addOnFailureListener(e -> b.status.setText("Could not load the video.\n" + Ui.error(e)));
    }

    private void start() {
        if (isFinishing() || isDestroyed()) return;
        b.status.setVisibility(View.GONE);
        b.saveBtn.setVisibility(getIntent().getBooleanExtra(EXTRA_ALLOW_SAVE, false) ? View.VISIBLE : View.GONE);
        player = new ExoPlayer.Builder(this).build();
        b.player.setPlayer(player);
        player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)));
        player.prepare();
        player.play();
    }

    /** Rider download option (13.9): copies the clip to Movies/RideGuard on the phone. */
    private void save() {
        if (Build.VERSION.SDK_INT < 29) { Ui.toast(this, "Saving videos needs Android 10 or newer."); return; }
        ContentValues v = new ContentValues();
        v.put(MediaStore.Video.Media.DISPLAY_NAME, "RideGuard_" + file.getName());
        v.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/RideGuard");
        Uri out = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
        if (out == null) { Ui.toast(this, "Could not save the video."); return; }
        try (InputStream in = new FileInputStream(file); OutputStream os = getContentResolver().openOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            Ui.toast(this, "Saved to Movies/RideGuard.");
        } catch (Exception e) {
            Ui.toast(this, "Could not save the video: " + e.getMessage());
        }
    }

    @Override protected void onStop() { super.onStop(); if (player != null) player.pause(); }

    @Override protected void onDestroy() {
        if (player != null) player.release();
        if (file != null) //noinspection ResultOfMethodCallIgnored
            file.delete();
        super.onDestroy();
    }
}
