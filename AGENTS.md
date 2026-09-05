# Codex Project Instructions

This is a pnpm workspace. The Expo React Native app lives in `apps/mobile`.

- Codex should use this `AGENTS.md` file as the project instruction source.
- Do not add Claude-specific config back to the project.
- Use `pnpm` for package scripts and dependency changes because `pnpm-lock.yaml` is committed.
- Run mobile app commands from the workspace root with `pnpm --filter @helpthehive/mobile <script>`, or from `apps/mobile` with `pnpm <script>`.
- Keep the project in Expo managed workflow unless native `ios/` or `android/` folders are explicitly requested.
- Before changing Expo or React Native APIs, check the exact Expo SDK 57 docs:
  https://docs.expo.dev/versions/v57.0.0/
