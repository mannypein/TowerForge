# TowerForge Link — game data straight from an emulator or Android phone

Players shouldn't have to hunt for `tool_export.json`. TowerForge Link is a
small Windows helper (`TowerForge.Link/`, .NET 8, one self-contained exe)
that reads the file off an emulator with the emulator's own adb — or, since
0.3, off an **Android phone on the same Wi-Fi** with Google's adb — and
hands it to towerforge.net open in the same PC's browser. The site's
**🖥 Get from emulator or phone** button and its **⚙** setup (next to
Import Game Data; hidden on phones and tablets) talk to it.

## Why a helper is needed

- The game writes the export to its own app folder:
  `/sdcard/Android/data/com.TechTreeGames.TheTower/files/tool_export.json`
  (Unity's `persistentDataPath`; TheTowerSDK `save/access/path`). The game's
  export button saves it there silently.
- Android 11+ hides other apps' `Android/data` folders from browsers, file
  managers and even "All files access" apps, so players end up searching or
  can't reach it at all. adb (Android's debugging connection) can.
- A web page can't run programs or open connections to an emulator, so a
  local helper does that part.

## What the player does

Once (the setup dialog, `components/LinkModal.tsx`, walks through it and
shows what Link found, checked every 4 s while it's open):
1. Download `TowerForgeLink.exe` from the dialog (`/downloads/TowerForgeLink.exe`)
   and run it. **Unsigned for now** — Windows SmartScreen says "Windows
   protected your PC"; More info → Run anyway. The dialog says why (no paid
   publisher certificate yet) and links the source on GitHub; browsers may
   also call the download uncommon (Keep). Signing is a later step.
2. Emulator: turn on ADB. BlueStacks: Settings → Advanced → Android Debug
   Bridge (ADB). Phone: see "Android phones over Wi-Fi" below.
3. The first time, Chrome / Edge ask whether towerforge.net may talk to apps
   on this device (Local Network Access) — allow.

Each time: export in the game (or Auto export), then click **Get from
emulator or phone** — or leave **⟳ Auto import** on.

Analytics (2026-10-16 → 10-23, before this dialog): 38 visitors pressed the
button with Link not running and 8 ever imported through it — the dialog
was rewritten to get more of them through setup.

## What happens when they click

1. The page calls `GET http://localhost:47821/export` (`engine/linkClient.ts`).
   If nothing answers, the setup dialog (`components/LinkModal.tsx`) opens.
2. The helper finds the emulators (`Emulators.cs`) and picks one adb — the
   running emulator's own, so it doesn't fight the adb the emulator runs,
   else Android's platform-tools.
3. `adb connect 127.0.0.1:<port>` for each running emulator.
4. For each device adb lists: `adb ls` the game's folder (the file-transfer
   channel — gives size and modified time; no shell needed).
5. The newest `tool_export.json`: `adb pull` into a temp file, read, delete.
6. The file goes back to the page with its time and emulator
   (`X-Export-Modified`, `X-Export-Source`); the page imports it exactly like
   a chosen file and says how old the export is.

Problems come back as a message for the player (HTTP 409 with `error` and
`message`), shown in the dialog: emulator not running, ADB off (BlueStacks
wording includes where the switch is), no export yet, game not installed,
phone asking to allow USB debugging.

## Auto import (2026-10-21, Link 0.2)

The game (29.1.3+) can export by itself every time it saves (Settings →
External Tools Export → Auto). The header's **⟳ Auto import** toggle
(`components/common/AutoImport.tsx`, off until the player turns it on,
remembered per browser) keeps the site in step while it's open:

- Every 30 s while the page is visible it asks
  `GET /export?newerThan=<file time of the last export it read>`. Link 0.2
  answers **204** (no body, nothing copied, nothing in its window) when the
  file isn't newer; older Links ignore the parameter and send the file.
- The game saves often during a run, so a newer export is imported right
  away only when it has a run the site doesn't have yet; otherwise at most
  every 10 minutes (currencies, levels), so a signed-in account isn't
  re-saved after every game save. A skipped export is read again once the
  10 minutes are up (`engine/autoImport.ts`, tested).
- Imports quietly: a short note, no pop-up. It waits for the account to
  load first, so a signed-in account's saved stats don't land on top of it.
- If Link isn't running when it's turned on, the setup dialog opens; later
  the button turns gold and its tooltip says why.

Checked 2026-10-21 against a stand-in Link with a made-up export: first
import on turning it on, a mid-run save skipped, a finished run imported at
the next ask, and the gold state when Link stopped. Link 0.2 itself checked
on BlueStacks: 204 for the same time, the file for an older one.

## Safety

- Listens on 127.0.0.1 only; nothing off the PC can reach it.
- Answers only `https://towerforge.net` / `www` and the local dev servers
  (`localhost:5173`, `localhost:4174`); other sites are refused, and the
  browser wouldn't let them read the answer anyway.
- Checks the `Host` header, so a site pointing its own name at 127.0.0.1
  (DNS rebinding) gets nothing.
- It reads that one file and nothing else. The phone actions (0.3) only
  download Google's adb from Google, or pair / connect with an address on a
  home network (10.x, 172.16–31.x, 192.168.x, 169.254.x) and a 6-digit code;
  anything else is refused before adb runs. It can't run other adb commands
  for anyone.
- iPhone backups (0.3) are only read, never changed: one file found by its
  documented name, nothing else in the backup is opened.
- The data goes emulator, phone or backup → helper → browser. Nothing is
  uploaded.

## Emulators

| Emulator | adb | Port(s) | Checked |
|---|---|---|---|
| BlueStacks 5 (and MSI / CN builds) | `HD-Adb.exe` in the install folder (registry `HKLM\SOFTWARE\BlueStacks_nxt` → `InstallDir`) | `bst.instance.*.adb_port` in `bluestacks.conf` (`UserDefinedDir`), usually 5555 | ✅ 5.22, Pie64 (Android 9), 2026-10-19 |
| MuMu 12 | `shell\adb.exe` / `nx_main\adb.exe` | 16384 (+32 per instance), 7555 | install paths and ports from guides |
| LDPlayer 9 | `C:\LDPlayer\LDPlayer9\adb.exe` | 5555, 5557, … | from guides |
| MEmu | `Microvirt\MEmu\adb.exe` | 21503, 21513, … | from guides |
| Nox | `Nox\bin\nox_adb.exe` | 62001, 62025, … | from guides |
| Phone over Wi-Fi (Android 11+) | Google's adb ≥ 1.0.41 (Link's own copy, the SDK or `PATH`) | wireless debugging's, found by mDNS | error paths, download and status ✅ 2026-10-23; a real phone not yet |
| Phone on USB | Android platform-tools (`PATH` or `%LOCALAPPDATA%\Android\Sdk`) | — | not yet |

BlueStacks notes (5.22):
- `bst.enable_adb_access` in `bluestacks.conf` is the Settings switch. With
  it off, adb connects and lists the device but every command is closed.
- Switched on in the file while BlueStacks ran, it applied within a few
  minutes without a restart; the helper's message says to wait a minute or
  restart.
- adb also finds it as `emulator-5554` on its own; both serials are the same
  emulator.

## Building and shipping

- `dotnet publish TowerForge.Link -c Release -o <folder>` → `TowerForgeLink.exe`
  (~10.7 MB, trimmed, single file, no .NET install needed).
- `deploy.ps1` publishes it into `towerforge.client/dist/downloads/` after the
  site build, so it ships with every deploy.
- Version: `<Version>` in `TowerForge.Link.csproj` (shown in its window and
  `/status`).

## Android phones over Wi-Fi (2026-10-23, Link 0.3)

For Android 11+ players with a PC: Link reads the phone the same way it
reads an emulator, over the phone's **Wireless debugging**, so the game's
Auto export plus the site's Auto import keep the site up to date while they
play on the phone. Phone and PC must be on the same Wi-Fi.

The player (the dialog's "Android phone" tab):
1. Developer options: Settings → About phone → tap Build number 7 times
   (Samsung: About phone → Software information).
2. Settings → Developer options → **Wireless debugging** → on.
3. **Get Google's adb** (once): emulators ship old adbs that can't pair
   (BlueStacks 5.22: 1.0.36; pairing needs 1.0.41, platform-tools 30+).
   Link uses one already on the PC (its own copy, the Android SDK folder,
   `PATH`), else downloads Google's package from
   `dl.google.com/android/repository/platform-tools-latest-windows.zip` and
   keeps `adb.exe`, its two DLLs and the notice in
   `%LOCALAPPDATA%\TowerForgeLink\platform-tools\` (`PlatformTools.cs`).
4. **Pair** (once): on the phone, *Pair device with pairing code*; the
   address and 6-digit code are typed in the dialog → `adb pair`. adb keeps
   the pairing (its key on the PC, the PC in the phone's list).
5. In the game: External Tools Export → Auto; on the site: Auto import.

Each time after (`Phones.cs`): before looking for the export Link runs
`adb mdns services`, connects to every `_adb-tls-connect._tcp` it lists (and
the last address that worked), then reads the file exactly as from an
emulator (`adb ls` + `adb pull` of the same path — adb's shell user can read
`Android/data`, which is why it works where apps and browsers can't).
Remembered in `%LOCALAPPDATA%\TowerForgeLink\phones.txt`: the phones paired
through Link and their last address, never the code.

Endpoints (POST, from towerforge.net only, one at a time with export reads):
`/phone/adb`, `/phone/pair?address=&code=`, `/phone/connect?address=`,
`/phone/forget`. `/status` gains `phone: { adbReady, adbVersion, paired,
connected: [model…] }` (missing before 0.3, so the dialog tells 0.1/0.2
users to update). With no phone paired, Link behaves exactly as 0.2
(emulator's own adb).

Checked 2026-10-23 on the owner's PC (the published, trimmed exe on a spare
port, then on 47821 with the site): `/status` with BlueStacks; other sites
refused; preflight allows POST; an internet address, a bad code and a phone
action without Google's adb each refused with the player's message; Google's
adb downloaded (1.9 s, adb 1.0.41) and reported ready; pairing and
connecting to an address with no phone fail after 20 s / 8 s with the
player's message and nothing remembered; adb's mDNS discovery runs (no
phones advertising); `/export?newerThan=` still answers 204 from BlueStacks.
**Not checked yet: a real phone** — pairing, mDNS reconnect after a phone
restart, and reading `Android/data` on Android 13–15.

Limits:
- Wireless debugging switches itself off when the phone restarts or leaves
  the Wi-Fi; switching it back on is enough (no new pairing).
- Guest networks and some routers block devices from seeing each other
  (client isolation) or block mDNS; the dialog's **Connect** field takes the
  address from the top of the Wireless debugging screen instead.
- Google's adb and an emulator's own adb fight over the adb server (port
  5037; each restarts it on a version mismatch). With a phone paired Link
  uses Google's for emulators too, so it doesn't flip back and forth.

## iPhone (2026-10-23)

iOS keeps the game's files in its sandbox: no app on the iPhone, no browser
and no Files app can open them, and the game has no share button for the
export (owner, 2026-10-23). What does reach them:

| Route | Status |
|---|---|
| **Backup to a Windows PC** — Link reads the export out of the newest iPhone backup | ✅ built (Link 0.3, `IPhoneBackups.cs`); checked on made-up backups, a real iPhone backup not yet |
| Link starts the backup itself (libimobiledevice `idevicebackup2`) | next — one click, or automatic over Wi-Fi |
| The game running on an Apple-silicon Mac — the export is on disk | instructions on the site (Terminal copy) |
| Backup to a Mac (Finder) | same backup format; Link is Windows-only for now |
| The iPhone alone | needs the game to expose the file (below) |

**Backups.** A backup of the iPhone to a computer (Apple Devices app or
iTunes: "Back up all of the data on your iPhone to this computer") includes
the game's `Documents` folder — players already pull the save out of it
("Applications/com.TechTreeGames.TheTower/Documents/playerInfo.dat" in
backup viewers, [the-tower-unified-tools](https://github.com/SFleet89/the-tower-unified-tools)),
and the game writes `tool_export.json` next to it (Unity's
`persistentDataPath`).
- Folders: `%USERPROFILE%\Apple\MobileSync\Backup` (Apple Devices app,
  iTunes from the Microsoft Store) and `%APPDATA%\Apple Computer\MobileSync\Backup`
  (iTunes from apple.com) — Apple's support page; one folder per device.
- Layout (iOS 10+): each file is stored as `<first 2 of id>/<id>`, the id
  being SHA-1 of `"<domain>-<relativePath>"`, here
  `AppDomain-com.TechTreeGames.TheTower` + `Documents/tool_export.json` →
  `86/86a2a853851a70370eaab58ebfa39a3ee733885b`. `Manifest.db` (SQLite)
  maps them; Link computes the id instead (no SQLite in the exe), and also
  tries `domain/path` and the old flat layout.
- `Info.plist` (XML) gives "Device Name" and "Last Backup Date"; an
  unencrypted backup's `Manifest.db` starts `SQLite format 3\0`, an
  encrypted one doesn't.
- **Encrypted backups** ("Encrypt local backup") can't be read yet: it takes
  the backup password (PBKDF2 → keybag → per-file AES keys; open-source
  readers exist, e.g. iOSbackup). The dialog says to leave encryption off and
  what that means (encrypted backups also keep saved passwords and Health
  data).
- Hands-free: with "Show this iPhone when on Wi-Fi" the backup needs no
  cable; iTunes syncs (and backs up) by itself when iTunes is open, the
  iPhone is charging and both are on the same Wi-Fi (Bonjour on). Auto
  import picks up each new backup.
- The newest export wins between an emulator / Android phone and the
  backups. `/status` lists the backups (`iphoneBackups`: when, encrypted,
  has the export). `--backups <folder>` points Link at a test folder.

Checked 2026-10-23 with made-up backups (an `Info.plist`, a
`Manifest.db` header, a made-up export at the hashed path): `/status`
listed it; `/export` returned exactly that file as "your iPhone backup from
Oct 23, 13:05"; `?newerThan=` its time → 204; an encrypted one is reported
encrypted and skipped; the site imported it through the dialog's Try again.
**Not checked: a real iPhone backup** — the next step is one player backing
up to a Windows PC with Link running.

Lesson from that test: Link reads the newest export of all sources, and
BlueStacks' Auto export kept writing the owner's real one — test with a
made-up export dated ahead of it (or `?newerThan=`), never by importing
whatever Link finds into the preview browser.

**Link starting the backup** (next): libimobiledevice's `idevicebackup2`
(LGPL-2.1, Windows builds in MSYS2) runs the device's backup service over
USB or Wi-Fi sync, through Apple's Mobile Device Service from the Apple
Devices app. Link could then offer "Back up and import" and keep an iPhone
in step without opening Apple Devices.

**The game on a Mac** (the iPad build on Apple silicon): its files are in
`~/Library/Containers/<random id>/Data/Documents/` (fan toolkit above). The
dialog gives a Terminal line that copies `tool_export.json` to the Desktop.

**The iPhone alone** needs Tech Tree Games: either a "Share" button for the
export (iOS share sheet), or two keys in the game's `Info.plist` —
`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` = YES — which
show the game's Documents folder in the Files app ("On My iPhone → The
Tower"; a Unity developer confirmed both keys are needed). Then the site's
Import Game Data could open the export in Safari straight from Files, and an
iOS Shortcut ("When The Tower is closed") could even pass it along. (The
keys would also expose `playerInfo.dat`; a share button exposes only the
export.)

## Phone only, no PC: TowerForge Link for Android (planned)

Most visitors are on phones (61%, 2026-10-16 → 10-23; only 6% of them
imported, against 20% on PCs). For Android players without a PC: a small
Android app that does on the phone what Link does on a PC — a web page alone
can't open `Android/data`.

How it would work:
1. **Reading the file — Shizuku.** Shizuku (free, on Google Play) runs a
   service with adb's shell rights, started on the phone itself through
   Wireless debugging (Android 11+; its own pairing notification, no PC).
   The app binds a Shizuku *UserService* that reads
   `/storage/emulated/0/Android/data/com.TechTreeGames.TheTower/files/tool_export.json`
   (and its time) — adb's shell user can, which is why Link works.
   After each phone restart the player opens Shizuku and taps Start.
   Later, the app could do the wireless-debugging pairing itself (as LADB
   does; libadb-android, Apache 2.0) and drop the Shizuku step.
2. **Talking to the site — the same API as Link.** A foreground service
   ("TowerForge Link is running" notification) answering
   `http://127.0.0.1:47821/status` and `/export?newerThan=` with the same
   origin and Host checks. Chrome on Android lets an https page fetch
   `localhost` (it asks once, like on a PC).
3. **The site on the phone.** The emulator/phone button and Auto import are
   hidden on touch screens today; on a phone the site would ask
   `127.0.0.1:47821/status` once and show them when the app answers. Auto
   import already checks again the moment the page becomes visible, so
   switching from the game to the browser brings the newest data in.
4. **Shipping.** First an APK on `towerforge.net/downloads` (the phone asks
   to allow installs from the browser); Google Play later (developer
   account, review, a privacy policy page).

Needs before building: the Android SDK command-line tools and a JDK on the
build PC (a few GB; not there on 2026-10-23), a signing key kept outside the
repo (backed up — updates need the same key), and an Android phone with The
Tower for testing. Considered and ruled out: the Storage Access Framework
(Android 11+ won't grant `Android/data`), "All files access" (still excludes
`Android/data`), root.

## Later

- Code signing (SmartScreen warning), e.g. Azure Trusted Signing.
- The phone-only Android app above; Link starting iPhone backups; reading
  encrypted iPhone backups; a Mac build of Link.
- A "Connect phone" button using WebUSB adb in Chrome / Edge, for phones on
  USB without installing anything.
