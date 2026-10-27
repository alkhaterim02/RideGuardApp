package com.rideguard.app;

import android.app.Application;
import com.rideguard.app.data.Fb;
import com.rideguard.app.notify.Notifier;
import java.io.File;
import org.osmdroid.config.Configuration;

public class RideGuardApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Fb.init(this);
        Notifier.createChannels(this);
        // OpenStreetMap tile policy needs a real user agent; keep the tile cache in app-private storage.
        Configuration.getInstance().setUserAgentValue(BuildConfig.APPLICATION_ID);
        Configuration.getInstance().setOsmdroidBasePath(new File(getCacheDir(), "osmdroid"));
        Configuration.getInstance().setOsmdroidTileCache(new File(getCacheDir(), "osmdroid/tiles"));
    }
}
