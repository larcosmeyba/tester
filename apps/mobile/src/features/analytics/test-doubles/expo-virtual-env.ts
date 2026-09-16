/**
 * Test double for Expo's `expo/virtual/env` module.
 *
 * babel-preset-expo rewrites `process.env.EXPO_PUBLIC_*` member expressions
 * into `env.EXPO_PUBLIC_*` with `import { env } from 'expo/virtual/env'`
 * (in non-production transforms, e.g. jest). That virtual module is ESM-only
 * and cannot load in the node test environment, so the jest moduleNameMapper
 * points it here instead. Passing `process.env` through keeps the semantics
 * identical: tests control `EXPO_PUBLIC_*` values via `process.env`.
 */

export const env: Record<string, string | undefined> = process.env;
