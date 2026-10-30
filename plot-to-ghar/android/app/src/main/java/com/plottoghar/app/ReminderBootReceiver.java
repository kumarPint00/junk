package com.plottoghar.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;

public final class ReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences("native_reminders", Context.MODE_PRIVATE);
        try {
            JSONArray array = new JSONArray(prefs.getString("reminders_json", "[]"));
            for (int i = 0; i < Math.min(array.length(), 100); i++) {
                JSONObject r = array.optJSONObject(i);
                if (r == null || r.optBoolean("completed", false)) continue;
                String id = r.optString("id"), title = r.optString("title"), date = r.optString("dueDate");
                if (id.isEmpty() || title.isEmpty() || date.isEmpty()) continue;
                NativeReminderBridge.scheduleOne(context, id, title, r.optString("category", "WORK"),
                        LocalDate.parse(date), "MONTHLY".equals(r.optString("repeat")), false);
            }
        } catch (Exception ignored) { }
    }
}
