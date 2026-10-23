// The reader that runs inside Shizuku (ExportReaderService), with adb's
// shell rights: it can open the game's Android/data folder, which apps
// can't on Android 11+.
package net.towerforge.link;

interface IExportReader {
    // Shizuku calls this to stop the service.
    void destroy() = 16777114;

    // 0 ok · 1 The Tower's folder is missing · 2 no export yet · 3 can't read it
    int state() = 1;

    // The export's file time in unix seconds (0: none).
    long modified() = 2;

    // The export, opened read-only (null: none). A file handle, so its size
    // doesn't matter (a binder call carries at most about 1 MB).
    ParcelFileDescriptor open() = 3;
}
