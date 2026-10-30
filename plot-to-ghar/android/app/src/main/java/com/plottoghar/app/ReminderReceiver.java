package com.plottoghar.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import java.time.LocalDate;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        final String id = intent.getStringExtra("id");
        final String title = intent.getStringExtra("title");
        final String category = intent.getStringExtra("category");
        final boolean monthly = intent.getBooleanExtra("monthly", false);
        final int day = intent.getIntExtra("day", 1);

        if (id == null || id.isEmpty() || title == null || title.isEmpty()) return;

        NativeReminderBridge.createChannel(context);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean permitted = Build.VERSION.SDK_INT < 33 ||
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;

        if (manager != null && permitted) {
            Notification notification = new Notification.Builder(context, NativeReminderBridge.CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle("Plot to Ghar · " + (category == null ? "Reminder" : category))
                    .setContentText(title)
                    .setAutoCancel(true)
                    .build();
            manager.notify(id.hashCode(), notification);
        }

        if (monthly && day >= 1 && day <= 31) {
            LocalDate now = LocalDate.now();
            LocalDate anchor = now.withDayOfMonth(Math.min(day, now.lengthOfMonth()));
            NativeReminderBridge.scheduleOne(context, id, title, category == null ? "WORK" : category, anchor, true, true);
        }
    }
}
