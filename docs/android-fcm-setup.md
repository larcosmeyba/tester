# Android FCM setup (google-services.json)

**Why this doc exists:** Android push notifications — including the benefits
renewal alerts — use Firebase Cloud Messaging. FCM does not work without
`google-services.json` for the app's package (`com.helpthehive`). The file is
gitignored (it identifies the Firebase project; keep it out of version control)
and must be attached to EAS builds via `eas credentials`. A production Android
build aborts in its `preInstall` hook (`apps/mobile/scripts/check-android-fcm.js`)
if the file is missing, with a pointer back to this doc.

## One-time setup (human)

### 1. Create the Firebase Android app

1. Go to the [Firebase console](https://console.firebase.google.com/) and open
   the Help The Hive project (create one if it doesn't exist yet).
2. Click **Add app** → **Android** (or Project settings → Your apps → Add app).
3. **Android package name:** `com.helpthehive` — must match exactly, including
   case. This is the `package` in `apps/mobile/app.json` → `android`.
4. **App nickname:** `HelpTheHive Android` (nickname only, any value).
5. **Debug signing certificate SHA-1:** optional — skip it. The release
   signature is managed by EAS (see `docs/android-release-signing.md`); add the
   release SHA-256/​SHA-1 from Play Console → Setup → App integrity later if
   any Firebase feature requires it.
6. Click **Register app**.

### 2. Download google-services.json

7. On the next step (**Download config file**), download `google-services.json`.
8. Verify the file: open it and confirm `client[0].client_info.android_client_info.package_name`
   is `com.helpthehive` and `project_info.project_id` is the Help The Hive
   Firebase project.

### 3. Attach it to EAS builds (do NOT commit it)

The file must stay out of git — `.gitignore` already covers
`apps/mobile/android/app/google-services.json`. Attach it to builds instead:

```sh
cd apps/mobile
eas credentials
```

1. Select **Android** as the platform.
2. Select the **production** build profile.
3. Choose **Google Services JSON: manage the google-services.json file**
   (wording varies slightly by EAS CLI version; pick the google-services.json
   option) → **Upload** the file you downloaded in step 7.
4. Confirm and exit. EAS injects the file into the build at
   `android/app/google-services.json` before dependencies install, which is
   what the `preInstall` fail-fast check looks for.

## Verify it worked

- Run a production Android build: `eas build --platform android --profile production`.
  The build log should show `[android-fcm-check] google-services.json present.`
  near the start. If the check fails, the build aborts with instructions —
  re-run `eas credentials` and re-upload.
- After installing the build on an Android 13+ device, the app must show the
  system notification permission prompt (`POST_NOTIFICATIONS` is declared in
  the manifest) and the onboarding push opt-in should register an Expo push
  token without errors.

## Notes

- If the Firebase project is ever recreated or the Android app re-registered,
  re-upload the new `google-services.json` via `eas credentials`.
- iOS push uses APNs, not this file — this doc is Android-only.
