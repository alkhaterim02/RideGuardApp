package com.rideguard.app.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.rideguard.app.R;
import com.rideguard.app.databinding.ItemIncidentBinding;
import com.rideguard.app.model.Incident;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

class IncidentAdapter extends RecyclerView.Adapter<IncidentAdapter.VH> {
    interface Click { void on(Incident i); }

    private final List<Incident> data = new ArrayList<>();
    private final Click click;
    private final boolean showRider;

    /** showRider: company view titles cards with the rider's name; the rider's own history uses the date. */
    IncidentAdapter(boolean showRider, Click click) { this.showRider = showRider; this.click = click; }

    void submit(List<Incident> items) { data.clear(); data.addAll(items); notifyDataSetChanged(); }

    @NonNull @Override public VH onCreateViewHolder(@NonNull ViewGroup p, int t) {
        return new VH(ItemIncidentBinding.inflate(LayoutInflater.from(p.getContext()), p, false));
    }

    @Override public void onBindViewHolder(@NonNull VH h, int pos) {
        Incident i = data.get(pos);
        int[] c = Labels.statusColors(i.status);
        Ui.chip(h.b.state, Labels.status(i.status), c[0], c[1]);
        h.b.sim.setVisibility(i.simulated ? View.VISIBLE : View.GONE);
        if (i.simulated) Ui.chip(h.b.sim, "⚙ Simulation", R.color.blue, R.color.blueBg);
        h.b.card.setBackgroundResource(i.isEmergency() ? R.drawable.card_urgent : i.isPending() ? R.drawable.card_warn : R.drawable.card_normal);

        String when = Labels.time(i.createdAt);
        h.b.title.setText(showRider ? (i.riderName != null ? i.riderName : "Unknown rider") : when);
        String where = i.hasLocation() ? String.format(Locale.US, "%.4f, %.4f", i.latitude, i.longitude) : "Location pending";
        h.b.sub.setText((showRider ? when + " · " : "") + i.id + (i.isSos() ? " · 🆘 SOS" : "") + "\n" + where);

        String foot = "SMS: " + Labels.sms(i.smsStatus) + " · Video: " + Labels.video(i.frontVideoUploadStatus);
        if (Incident.CLOSED.equals(i.status) && i.outcome != null) foot += "\nResult: " + Labels.outcome(i.outcome);
        if (i.falseAlarmRequested) foot += "\n! Rider reported a false alarm";
        h.b.foot.setText(foot);
        h.b.card.setOnClickListener(v -> click.on(i));
        h.b.card.setContentDescription(Labels.status(i.status) + ", " + h.b.title.getText());
    }

    @Override public int getItemCount() { return data.size(); }

    static class VH extends RecyclerView.ViewHolder {
        final ItemIncidentBinding b;
        VH(ItemIncidentBinding b) { super(b.getRoot()); this.b = b; }
    }
}
