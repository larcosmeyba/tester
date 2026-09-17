# Android dev client won't open — diagnosis & fix (2026-09-17)

## What was checked

Static analysis of `main` (no emulator on the diagnosis machine, so the code
and config were verified instead of the running app):

- `apps/mobile/app.json` parses and resolves via `npx expo config` — all six
  config plugins load, every referenced asset exists
  (`icon.png`, `hive/logo.png`, all adaptive-icon layers, `penny.png`, …).
- A full production Android JS bundle builds cleanly
  (`npx expo export --platform android` → exit 0, 5 MB `.hbc`).
- `npx expo prebuild --platform android` succeeds and generates a correct
  `AndroidManifest.xml` (LAUNCHER activity, VIEW/BROWSABLE intent filter for
  the `/auth/verified` magic link, `POST_NOTIFICATIONS` permission).
- No module-scope crash in dev: the three fail-fast `throw`s added 2026-09-16
  (`graphql/client.ts`, `auth-client.ts`, `constants/env.ts`) are all gated on
  `!__DEV__`, and dev-client builds run with `__DEV__ === true`.
- The unmerged `arlo/store-checklist-fixes` branch is **not** the cause — its
  `app.config.js` has no eval-time throw, and it isn't merged into `main`
  anyway. Its FCM `preInstall` hook only gates production EAS builds.

**Conclusion: there is no code or config defect on `main` that would stop the
app opening. The problem is the app installed on the Pixel_8 emulator, not
the repo.** This is the third stale-build incident on that emulator (the
Android icon thread, and the `expo-clipboard` native-module crash hardened
in commit `7a97885` — both were "the emulator's installed build doesn't match
the current code").

## Fix: rebuild the dev client and reinstall it

Do this on the Mac, in `~/tester/apps/mobile`:

**Option A — EAS (recommended, no Android SDK needed):**

```bash
eas build --profile development --platform android
```

When it finishes, install the APK on the running emulator (drag-and-drop the
APK onto the emulator window, or `adb install path/to/app.apk`). **Uninstall
the old HelpTheHive app from the emulator first** (long-press the icon →
Uninstall) so no stale native shell survives.

**Option B — local build:**

```bash
npx expo run:android
```

This regenerates the native project from `app.json` (the committed
`android/` dir was removed on purpose — managed workflow) and installs a
fresh dev client. Also uninstall the old app first.

Then:

1. Start Metro: `npx expo start` (from `apps/mobile`).
2. Open the **HelpTheHive dev build** on the emulator — not Expo Go. (With
   `expo-dev-client` installed, the QR code is for the dev build; scanning it
   with Expo Go will not open the project.)

## If it still won't open — capture the crash log

With the emulator running and the app installed, on the Mac:

```bash
# Clear old logs, launch the app, then dump what it printed:
adb logcat -c
# …tap the HelpTheHive icon on the emulator (let it crash)…
adb logcat -d '*:E' > /tmp/hth-crash.txt
```

Or watch it live while tapping the icon:

```bash
adb logcat '*:E' | grep -i -E "helpthehive|reactnative|expo|AndroidRuntime"
```

Send `/tmp/hth-crash.txt` back — the `AndroidRuntime` block names the exact
native exception, which is what we need when the code side is clean.
