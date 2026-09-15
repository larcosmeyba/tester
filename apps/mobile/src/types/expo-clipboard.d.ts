/**
 * Ambient declaration for expo-clipboard so `tsc` passes in a checkout where
 * `pnpm install` has not run yet (the dependency is declared in package.json
 * but node_modules may predate it). The screen resolves the real module
 * lazily at runtime, so the app builds and the button simply hides when the
 * native module is unavailable.
 */
declare module 'expo-clipboard' {
  export function getStringAsync(): Promise<string>;
  export function setStringAsync(value: string): Promise<void>;
  export function hasStringAsync(): Promise<boolean>;
}
