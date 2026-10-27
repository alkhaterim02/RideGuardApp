package com.rideguard.app.ui;

import android.graphics.drawable.Drawable;
import androidx.core.content.ContextCompat;
import com.rideguard.app.R;
import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.Marker;

/** OpenStreetMap via osmdroid: no API key needed. "Directions" hands off to Google Maps. */
public final class MapHelper {
    private MapHelper() {}

    public static void setup(MapView map) {
        map.setTileSource(TileSourceFactory.MAPNIK);
        map.setMultiTouchControls(true);
        map.getController().setZoom(16.0);
    }

    public static void show(MapView map, double lat, double lng, String title) {
        GeoPoint p = new GeoPoint(lat, lng);
        map.getOverlays().clear();
        Marker m = new Marker(map);
        m.setPosition(p);
        m.setTitle(title);
        m.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
        Drawable icon = ContextCompat.getDrawable(map.getContext(), R.drawable.ic_pin);
        if (icon != null) m.setIcon(icon);
        map.getOverlays().add(m);
        map.getController().setCenter(p);
        map.invalidate();
    }
}
