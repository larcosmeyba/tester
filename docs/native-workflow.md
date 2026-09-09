# Native workflow: managed, with committed native projects

**Decision (2026-09-09, fix/store-readiness-and-design-system): bare-vs-managed → MANAGED.**

`app.json` is the single source of truth for native configuration. `apps/mobile/ios/`
and `apps/mobile/android/` are committed **build artifacts of `app.json`** —
regenerated, never hand-designed. This resolves the store-readiness audit's
structural finding: the checked-in native projects had drifted from `app.json`
(missing `POST_NOTIFICATIONS`, stale usage descriptions, debug-signed release),
because `app.json` plugin changes silently did nothing until someone re-ran
prebuild.

## Evidence for the decision (custom-native-code check, 2026-09-09)

Before choosing, `ios/` and `android/` were inspected for anything that is not
standard Expo SDK 57 prebuild template output:

- `ios/HelpTheHive/AppDelegate.swift` — stock `ExpoAppDelegate` template; the only
  overrides are the deep-link/universal-link handlers the `expo-linking` config
  plugin generates.
- `android/.../MainActivity.kt`, `MainApplication.kt` — stock SDK 57 Kotlin
  templates; splash-screen `@generated` markers only; no hand-added packages.
- No custom native modules (no extra `.swift`/`.m`/`.kt`/`.java` beyond the
  template), no custom pods in `Podfile`, no custom entries in
  `settings.gradle` / root `build.gradle` / `project.pbxproj`.
- `HelpTheHive.entitlements` is an empty dict; `PrivacyInfo.xcprivacy` is the
  standard no-tracking manifest.
- The only drift found: the Kotlin sources lived under
  `com/podoglyphai/HelpTheHive/` (stale directory name from an old package) while
  the package was `com.helpthehive` — fixed automatically by the clean prebuild.

**Nothing found requires bare workflow.** Everything the audit asked for is
expressible via `app.json` plugin config, except the two manual items below.

## Going-forward workflow

1. Edit native configuration in `apps/mobile/app.json` (permissions, plugins,
   icons, splash, scheme, `ios.infoPlist`, etc.) — never in `ios/`/`android/`
   directly.
2. Regenerate: `cd apps/mobile && npx expo prebuild --clean`
   (repo is a pnpm workspace; run from `apps/mobile` or
   `pnpm --filter @helpthehive/mobile` from the root — do not switch package
   managers).
3. Re-apply the manual items listed below (they cannot be expressed via
   `app.json`).
4. Commit the regenerated `ios/` + `android/` together with the `app.json`
   change — they are one atomic unit.

Note: the repo's `AGENTS.md` says to keep the project in Expo managed workflow
unless native folders are explicitly requested. If the team later wants the
pure-managed layout, `ios/` and `android/` can be removed from git (EAS builds
run prebuild itself); that is a separate decision — until then they stay
committed as regenerable artifacts.

## Manual re-apply list (after every `prebuild --clean`)

These have no `app.json` knob, so each regeneration reintroduces the bad
default. Both spots carry an inline comment pointing back here.

1. **`apps/mobile/android/app/build.gradle`** — the `release` buildType's
   template default is `signingConfig signingConfigs.debug` (Google Play rejects
   debug-signed AABs). Delete that line and keep the EAS-credentials comment
   block. Real signing comes from `eas credentials` (see
   `docs/android-release-signing.md`); leaving the debug line in place would let
   a local release build silently produce an unshippable AAB.
2. **`apps/mobile/android/app/src/main/AndroidManifest.xml`** — delete the
   `SYSTEM_ALERT_WINDOW` line. It is a stale default from Expo's
   `expo-template-bare-minimum` base manifest ("OPTIONAL PERMISSIONS, REMOVE
   WHATEVER YOU DO NOT NEED"); Play requires a special declaration for it.
3. **`apps/mobile/ios/HelpTheHive/PrivacyInfo.xcprivacy`** — prebuild only
   writes this file when `app.json` sets `ios.privacyManifests`; `--clean`
   deletes the existing one. Restore it from git
   (`git show HEAD:apps/mobile/ios/HelpTheHive/PrivacyInfo.xcprivacy > …`)
   after each clean prebuild. **Better fix (Track A):** move its contents into
   `app.json` under `"ios": { "privacyManifests": { "NSPrivacyAccessedAPITypes": …,
   "NSPrivacyCollectedDataTypes": [], "NSPrivacyTracking": false } }` so
   prebuild generates it and this manual step goes away.

## What prebuild now handles automatically (no manual edits)

- `android.permission.POST_NOTIFICATIONS` — declared via
  `android.permissions` in `app.json` (audit A7 fixed).
- iOS usage descriptions pruned via plugin props: `expo-image-picker`
  `cameraPermission: false` / `microphonePermission: false`,
  `expo-location` `locationAlways…: false` / `motionUsagePermission: false`,
  `expo-secure-store` `faceIDPermission: false` (audit I7/I8/I9 fixed).
  Resulting `Info.plist` keeps only `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`, `NSLocalNetworkUsageDescription`.
- Android `CAMERA` / `RECORD_AUDIO` — the image-picker plugin emits them with
  `tools:node="remove"`, so Gradle's manifest merger strips them from the final
  APK/AAB even though the lines remain visible in the checked-in manifest.
  Do **not** hand-delete those lines; the marker is the mechanism.
- Deep-link scheme `helpthehive://` — wired in `app.json` (`scheme`), `Info.plist`
  (`CFBundleURLSchemes`), and the manifest intent filter (audit I14/A15 OK).
- Package-name drift (`com/podoglyphai/...` directory) — gone; sources now live
  under `com/helpthehive/`.

## Known items prebuild did NOT fix (follow-ups)

- **I13 — `LSMinimumSystemVersion` is still `12.0`** while
  `IPHONEOS_DEPLOYMENT_TARGET` is `16.4`. Prebuild does not align these.
  Fix via `app.json`: `"ios": { "infoPlist": { "LSMinimumSystemVersion": "16.4" } }`
  then re-run prebuild. (Track A territory — left untouched here.)
- **I5 — iOS icon** still uses the new `.icon`-directory format
  (`ios/HelpTheHive/expo.icon/`); `AppIcon.appiconset` contains only
  `Contents.json`. Must verify the icon renders on a TestFlight build.
- Prebuild warns: `ios.usesAppleSignIn: Install expo-apple-authentication to
  enable this feature`. Intentional — sign-in is web-based via better-auth
  (audit I4); no native Apple-sign-in module is wanted.
