// ============================================================
//  TowerForge Link for Android — the reader inside Shizuku
//  Shizuku runs this class in its own process with adb's shell
//  rights (a "user service"). The shell user can open
//  Android/data/<package>/ — apps and browsers can't on Android 11+,
//  which is why the game's export can't simply be picked in a
//  browser. It only reads the one file, and hands it back as a
//  read-only file handle.
// ============================================================

package net.towerforge.link;

import android.os.ParcelFileDescriptor;

import java.io.File;

public class ExportReaderService extends IExportReader.Stub {

    // Unity's persistentDataPath for the game (TheTowerSDK save/access/path).
    static final String FOLDER = "/storage/emulated/0/Android/data/com.TechTreeGames.TheTower/files";
    static final String FILE = FOLDER + "/tool_export.json";

    public ExportReaderService() {
    }

    @Override
    public void destroy() {
        System.exit(0);
    }

    @Override
    public int state() {
        if (!new File(FOLDER).isDirectory()) return 1;
        File file = new File(FILE);
        if (!file.isFile()) return 2;
        return file.canRead() ? 0 : 3;
    }

    @Override
    public long modified() {
        File file = new File(FILE);
        return file.isFile() ? file.lastModified() / 1000 : 0;
    }

    @Override
    public ParcelFileDescriptor open() {
        try {
            return ParcelFileDescriptor.open(new File(FILE), ParcelFileDescriptor.MODE_READ_ONLY);
        } catch (Exception e) {
            return null;
        }
    }
}
