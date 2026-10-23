// ============================================================
//  TowerForge Link for Android — Shizuku
//  Shizuku (free, on Google Play) is started by the player through
//  Wireless debugging and lends apps it trusts adb's shell rights.
//  This keeps one connection to the reader running inside it
//  (ExportReaderService), binding it when Shizuku is up and this app
//  is allowed, and says what's missing when it isn't.
// ============================================================

package net.towerforge.link;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import rikka.shizuku.Shizuku;

final class ShizukuReader {

    static final String SHIZUKU_PACKAGE = "moe.shizuku.privileged.api";

    enum State { NOT_INSTALLED, NOT_RUNNING, NO_PERMISSION, READY }

    private static final Object LOCK = new Object();
    private static IExportReader reader;
    private static boolean binding;
    private static long bindingSince;

    private static final Shizuku.UserServiceArgs ARGS = new Shizuku.UserServiceArgs(
            new ComponentName(BuildConfig.APPLICATION_ID, ExportReaderService.class.getName()))
            .daemon(false)
            .processNameSuffix("reader")
            .debuggable(BuildConfig.DEBUG)
            .version(BuildConfig.VERSION_CODE);

    private static final ServiceConnection CONNECTION = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            synchronized (LOCK) {
                reader = service != null && service.pingBinder() ? IExportReader.Stub.asInterface(service) : null;
                binding = false;
                LOCK.notifyAll();
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            synchronized (LOCK) {
                reader = null;
                binding = false;
                LOCK.notifyAll();
            }
        }
    };

    private ShizukuReader() {
    }

    static boolean installed(Context context) {
        try {
            context.getPackageManager().getPackageInfo(SHIZUKU_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    static State state(Context context) {
        if (!installed(context)) return State.NOT_INSTALLED;
        // Versions before 11 used another API this app doesn't speak.
        if (!Shizuku.pingBinder() || Shizuku.isPreV11()) return State.NOT_RUNNING;
        if (Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) return State.NO_PERMISSION;
        return State.READY;
    }

    // The reader, binding it if needed and waiting up to waitMs (null: not ready).
    static IExportReader reader(Context context, long waitMs) {
        if (state(context) != State.READY) return null;
        synchronized (LOCK) {
            if (reader != null && reader.asBinder().pingBinder()) return reader;
            reader = null;
            // A bind that never answered (Shizuku restarted meanwhile) is tried again.
            if (binding && System.currentTimeMillis() - bindingSince > 15_000) binding = false;
            if (!binding) {
                binding = true;
                bindingSince = System.currentTimeMillis();
                new Handler(Looper.getMainLooper()).post(() -> {
                    try {
                        Shizuku.bindUserService(ARGS, CONNECTION);
                    } catch (RuntimeException e) {
                        synchronized (LOCK) {
                            binding = false;
                            LOCK.notifyAll();
                        }
                    }
                });
            }
            long until = System.currentTimeMillis() + waitMs;
            while (reader == null && binding) {
                long left = until - System.currentTimeMillis();
                if (left <= 0) break;
                try {
                    LOCK.wait(left);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            return reader;
        }
    }
}
