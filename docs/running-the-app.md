# Running the app

## Important: this app does not work in Expo Go

Help The Hive uses native modules that Expo Go does not contain — Better Auth,
Reanimated, SecureStore, Notifications, Location. Running it needs a **dev
client**: a build of the app itself that then loads your JavaScript from Metro.

You build the dev client once per platform. After that, day-to-day work is just
`pnpm start`, and every JavaScript change reloads instantly without rebuilding.

---

## Day-to-day (once a dev client is installed)

From the repo root:

```bash
pnpm start
```

Then, in that terminal:

- press **i** — open on the iOS simulator
- press **a** — open on the Android emulator
- press **r** — reload
- press **j** — open the debugger

Edit a file, save, and the app reloads on its own.

---

## iOS — already set up on this Mac

The dev client is built and installed on the **iPhone 17 Pro** simulator. Just
run `pnpm start` and press **i**.

To rebuild it from scratch (only needed after changing native config or adding a
native dependency):

```bash
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"   # see local-ios-setup.md
pnpm --filter @helpthehive/mobile ios
```

That takes roughly 5–10 minutes the first time.

---

## Android — one-time setup needed

### 1. Install Android Studio

Download from https://developer.android.com/studio and open it. In the setup
wizard, keep the default components — you need the **SDK**, the **platform
tools**, and at least one **system image**.

### 2. Point the shell at the SDK

Add to `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then open a new terminal and check:

```bash
adb --version
emulator -list-avds
```

### 3. Create an emulator

In Android Studio: **More Actions ▸ Virtual Device Manager ▸ Create Device**.
A Pixel 8 with a recent API level is a good default. Start it.

### 4. Build the dev client

```bash
pnpm --filter @helpthehive/mobile android
```

First run downloads Gradle dependencies and takes a while — 10–20 minutes is
normal. After that, `pnpm start` then **a** is all you need.

---

## Testing on a real phone

Simulators cover most things, but not everything — Apple Sign In, push
notifications and real GPS behave differently on hardware. For a device build,
use EAS (the project already has `eas.json`):

```bash
pnpm --filter @helpthehive/mobile exec eas build --profile development --platform ios
pnpm --filter @helpthehive/mobile exec eas build --profile development --platform android
```

That builds in the cloud and gives you a link to install on your phone.

---

## What you can and cannot test right now

The meal-plan system runs against a **development mock**, because the backend has
no meal endpoints yet (see [meal-plan-backend-contract.md](meal-plan-backend-contract.md)).
Everything below works end to end against seeded data:

- the 13-section questionnaire
- generating a plan
- the plan page, and moving meals between days and slots
- the grocery list, aisle grouping and package rounding
- browsing and picking recipes

**Sign-in will not work** unless the auth server is running:

```bash
pnpm auth:dev      # Better Auth, in a second terminal
pnpm server        # Go GraphQL server, in a third
```

Without them, the app stops at the welcome screen. To reach the meal screens
without signing in, open them directly:

```bash
xcrun simctl openurl booted helpthehive://meals/questionnaire
xcrun simctl openurl booted helpthehive://meals/plan
xcrun simctl openurl booted helpthehive://meals/build
xcrun simctl openurl booted helpthehive://meals/grocery-list
```

On Android the equivalent is:

```bash
adb shell am start -a android.intent.action.VIEW -d "helpthehive://meals/questionnaire"
```

---

## Reporting what needs fixing

The most useful thing you can send is: **which screen**, **what you tapped**, and
**what you expected instead**. A screenshot is ideal. If something crashes or
looks wrong, the Metro terminal usually prints the reason — copying that line
saves a lot of guessing.
