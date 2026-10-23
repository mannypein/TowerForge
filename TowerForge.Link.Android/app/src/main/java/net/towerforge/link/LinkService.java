// ============================================================
//  TowerForge Link for Android — keeping the link on
//  A foreground service (with its notification, as Android requires)
//  runs the local server while the player plays, so towerforge.net in
//  the phone's browser can ask for the newest export whenever it's
//  opened. "Stop" in the notification, or in the app, turns it off.
// ============================================================

package net.towerforge.link;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import java.io.IOException;

public class LinkService extends Service {

    static final String ACTION_STOP = "net.towerforge.link.STOP";
    private static final String CHANNEL = "link";
    private static final int NOTIFICATION = 1;

    // Read by the setup screen.
    static volatile boolean running;
    static volatile String problem;

    private LinkServer server;

    static void start(Context context) {
        context.startForegroundService(new Intent(context, LinkService.class));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, LinkService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        Notification notification = notification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION, notification);
        }
        if (server == null) {
            LinkServer s = new LinkServer(this);
            try {
                s.start();
                server = s;
                running = true;
                problem = null;
            } catch (IOException e) {
                // Another app (or another copy) already uses the port.
                problem = "Couldn't start: something else on this phone already uses port " + LinkServer.PORT + ".";
                running = false;
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        // Connect to Shizuku early, so the first request is quick.
        new Thread(() -> ShizukuReader.reader(this, 5000), "shizuku-bind").start();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (server != null) server.stop();
        server = null;
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification notification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(getString(R.string.channel_description));
            nm.createNotificationChannel(channel);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), flags);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, LinkService.class).setAction(ACTION_STOP), flags);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(getString(R.string.notification_title))
                .setContentText(getString(R.string.notification_text))
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(new Notification.Action.Builder(null, getString(R.string.stop), stop).build())
                .build();
    }
}
