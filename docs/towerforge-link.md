# TowerForge Link — game data straight from an emulator

Players on PC emulators shouldn't have to hunt for `tool_export.json`.
TowerForge Link is a small Windows helper (`TowerForge.Link/`, .NET 8, one
self-contained exe) that reads the file off the emulator with the
emulator's own adb and hands it to towerforge.net open in the same PC's
browser. The site's **🖥 Get from emulator** button (next to Import Game
Data; hidden on phones and tablets) talks to it.

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

Once:
1. Download `TowerForgeLink.exe` from the dialog (`/downloads/TowerForgeLink.exe`)
   and run it. **Unsigned for now** — Windows SmartScreen says it protected
   the PC; More info → Run anyway. Signing is a later step.
2. Turn on ADB in the emulator. BlueStacks: Settings → Advanced → Android
   Debug Bridge (ADB).
3. The first time, Chrome / Edge ask whether towerforge.net may talk to apps
   on this device (Local Network Access) — allow.

Each time: export in the game, then click **Get from emulator**.

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

## Safety

- Listens on 127.0.0.1 only; nothing off the PC can reach it.
- Answers only `https://towerforge.net` / `www` and the local dev servers
  (`localhost:5173`, `localhost:4174`); other sites are refused, and the
  browser wouldn't let them read the answer anyway.
- Checks the `Host` header, so a site pointing its own name at 127.0.0.1
  (DNS rebinding) gets nothing.
- One job: read that one file. It can't run other adb commands for anyone.
- The data goes emulator → helper → browser. Nothing is uploaded.

## Emulators

| Emulator | adb | Port(s) | Checked |
|---|---|---|---|
| BlueStacks 5 (and MSI / CN builds) | `HD-Adb.exe` in the install folder (registry `HKLM\SOFTWARE\BlueStacks_nxt` → `InstallDir`) | `bst.instance.*.adb_port` in `bluestacks.conf` (`UserDefinedDir`), usually 5555 | ✅ 5.22, Pie64 (Android 9), 2026-10-19 |
| MuMu 12 | `shell\adb.exe` / `nx_main\adb.exe` | 16384 (+32 per instance), 7555 | install paths and ports from guides |
| LDPlayer 9 | `C:\LDPlayer\LDPlayer9\adb.exe` | 5555, 5557, … | from guides |
| MEmu | `Microvirt\MEmu\adb.exe` | 21503, 21513, … | from guides |
| Nox | `Nox\bin\nox_adb.exe` | 62001, 62025, … | from guides |
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

## Later

- Code signing (SmartScreen warning), e.g. Azure Trusted Signing.
- A "Connect phone" button using WebUSB adb in Chrome / Edge, for phones on
  USB without installing anything.
- An Android app could read the file on Android 11+ only through wireless
  debugging (as Shizuku / LADB do); a plain app hits the same wall as the
  browser.
