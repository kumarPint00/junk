package com.plottoghar.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;

/**
 * Local Android reminder scheduling. Does not send data to any push provider.
 * Alarms are inexact: Android battery restrictions may delay delivery.
 */
public final class NativeReminderBridge {
    static final String CHANNEL = "plot_to_ghar_reminders";
    private static final String PREF = "native_reminders";
    private static final String IDS = "scheduled_ids";
    private final Activity activity;
    private final WebView web;

    public NativeReminderBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        createChannel(activity);
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL, "Construction reminders", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Plot to Ghar payments, deliveries and work schedule reminders");
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private boolean validOrigin() {
        String current = web.getUrl();
        return current != null && (current.equals(BuildConfig.APP_URL) ||
                current.startsWith(BuildConfig.APP_URL + "/") ||
                current.startsWith(BuildConfig.APP_URL + "?"));
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        activity.runOnUiThread(() -> {
            if (!validOrigin()) return;
            if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 405);
            } else {
                Toast.makeText(activity, "Device notifications enabled", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void syncReminders(String json) {
        if (json == null || json.length() > 140_000) return;
        activity.runOnUiThread(() -> {
            if (!validOrigin()) return;
            try {
                JSONArray reminders = new JSONArray(json);
                if (reminders.length() > 100) return;
                SharedPreferences prefs = activity.getSharedPreferences(PREF, Context.MODE_PRIVATE);
                Set<String> oldIds = new HashSet<>(prefs.getStringSet(IDS, new HashSet<>()));
                Set<String> newIds = new HashSet<>();

                for (int i = 0; i < reminders.length(); i++) {
                    JSONObject item = reminders.optJSONObject(i);
                    if (item == null || item.optBoolean("completed", false)) continue;
                    String id = item.optString("id");
                    String title = item.optString("title");
                    String date = item.optString("dueDate");
                    if (id.isEmpty() || id.length() > 80 || title.isEmpty() || title.length() > 160) continue;
                    if (date.length() != 10) continue;
                    LocalDate due = LocalDate.parse(date);
                    boolean monthly = "MONTHLY".equals(item.optString("repeat"));
                    String category = item.optString("category", "WORK");
                    newIds.add(id);
                    scheduleOne(activity, id, title, category, due, monthly, false);
                }
                for (String id : oldIds) {
                    if (!newIds.contains(id)) cancelOne(activity, id);
                }
                prefs.edit().putStringSet(IDS, newIds).apply();
            } catch (Exception ignored) {
                // Invalid client state must never crash the Android shell.
            }
        });
    }

    static void cancelOne(Context context, String id) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        PendingIntent pending = pending(context, id, "", "", false, 1);
        alarm.cancel(pending);
        pending.cancel();
    }

    static PendingIntent pending(Context context, String id, String title, String category, boolean monthly, int day) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction("com.plottoghar.app.REMINDER." + id);
        intent.putExtra("id", id);
        intent.putExtra("title", title);
        intent.putExtra("category", category);
        intent.putExtra("monthly", monthly);
        intent.putExtra("day", day);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleOne(Context context, String id, String title, String category, LocalDate dueDate,
                            boolean monthly, boolean followingMonth) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;
        LocalDate today = LocalDate.now();
        LocalDate scheduledDate = dueDate;
        if (monthly) {
            int day = dueDate.getDayOfMonth();
            scheduledDate = today.withDayOfMonth(Math.min(day, today.lengthOfMonth()));
            if (followingMonth || scheduledDate.atTime(9, 0).isBefore(LocalDateTime.now())) {
                LocalDate next = today.plusMonths(1);
                scheduledDate = next.withDayOfMonth(Math.min(day, next.lengthOfMonth()));
            }
            if (dueDate.isAfter(scheduledDate)) scheduledDate = dueDate;
        } else {
            if (dueDate.isBefore(today)) return;
        }
        long at = scheduledDate.atTime(LocalTime.of(9, 0)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
        if (at <= System.currentTimeMillis()) return;
        PendingIntent pending = pending(context, id, title, category, monthly, dueDate.getDayOfMonth());
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
    }
}
