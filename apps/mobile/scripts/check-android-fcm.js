#!/usr/bin/env node
/**
 * Fail-fast check for Android FCM configuration.
 *
 * Wired as the `preInstall` hook in eas.json. Production Android builds need
 * `android/app/google-services.json` (Firebase Cloud Messaging) for push
 * notifications — including benefits renewal alerts — to work at all.
 * The file is gitignored, so if it was never attached to the build via
 * `eas credentials`, the EAS checkout won't have it and the build would
 * otherwise succeed while shipping dead push.
 *
 * Skips silently for non-Android and non-production builds.
 */

const fs = require('fs');
const path = require('path');

const profile = process.env.EAS_BUILD_PROFILE;
const platform = process.env.EAS_BUILD_PLATFORM;

// Only gate production Android builds.
if (platform !== 'android' || profile !== 'production') {
  process.exit(0);
}

// EAS runs build hooks with the project root (apps/mobile) as the working
// directory, so resolve relative to cwd rather than __dirname (which the
// project's eslint config does not define as a node global).
const googleServicesPath = path.resolve('android', 'app', 'google-services.json');

if (!fs.existsSync(googleServicesPath)) {
  console.error(`
[android-fcm-check] FATAL: android/app/google-services.json is missing.

Production Android builds need Firebase Cloud Messaging configured, otherwise
push notifications (including benefits renewal alerts) will not work on any
Android device.

To fix, a human must:
  1. Follow docs/android-fcm-setup.md: create the Android app for package
     com.helpthehive in the Firebase console and download google-services.json.
  2. Run: eas credentials
     Select Android -> the production build profile -> upload the downloaded
     google-services.json (EAS injects it into the build; the file stays out
     of git).
  3. Re-run the production build.

Aborting the build now instead of shipping an app with dead push.
`);
  process.exit(1);
}

console.log('[android-fcm-check] google-services.json present.');
