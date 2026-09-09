# Android release signing

**Why this doc exists:** `apps/mobile/android/app/build.gradle` no longer signs the
`release` buildType with the debug keystore (Google Play rejects debug-signed
AABs). Release signing is owned by EAS via `eas credentials`. Until the steps
below are done, production Android builds will fail at the signing step — which
is the intended, loud failure instead of shipping a debug-signed AAB.

## One-time setup (human)

Run from `apps/mobile`:

```sh
cd apps/mobile
eas credentials
```

1. Select **Android** as the platform.
2. Select the **production** build profile.
3. Choose **Keystore: Manage your Android keystore** (wording varies slightly by
   EAS CLI version; pick the keystore option for the production profile).
4. Choose **Generate new keystore** (recommended) or **Upload an existing
   keystore** if Help The Hive already has one from a previous release.
   - If you upload: you need the keystore file plus its keystore password,
     key alias, and key password. Keep these in a password manager — losing
     the release keystore means you can never update the Play Store listing
     under the same app signature.
5. Confirm and exit. EAS stores the keystore server-side; it is never committed
   to this repo.

## Verify the AAB is release-signed

After a production build finishes, download the `.aab` from the EAS build page
and run (requires a JDK on your machine):

```sh
# 1. Confirm the AAB is signed at all
jarsigner -verify -verbose -certs app-production.aab | head -20

# 2. Confirm it is NOT the debug key
keytool -printcert -jarfile app-production.aab | grep -i "SHA256"
```

Compare the SHA-256 fingerprint against the **App signing key certificate**
shown in Play Console → your app → Setup → App integrity. If they match, the
AAB carries the real release signature. If the fingerprint doesn't match what
Play Console shows, signing is misconfigured; re-run `eas credentials` and
rebuild.

You can also check before uploading: in Play Console, App integrity shows the
SHA-256 of the upload key EAS used. The first production upload registers it.

## Notes

- The checked-in `apps/mobile/android/app/debug.keystore` is only for local
  `debug` builds (`expo run:android`, development clients). It must never sign
  a release.
- If `eas credentials` reports "no keystore configured" for the production
  profile, the build will fail at signing time. That is expected — configure
  the keystore first.
