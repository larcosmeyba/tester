/**
 * Test double for the `vexo-analytics` SDK.
 *
 * Wired via the jest `moduleNameMapper` in package.json, so every import of
 * `vexo-analytics` — including transitive ones from vexo-client.ts — resolves
 * here instead of loading the real native module (which cannot load in the
 * node test environment). Tests assert against these jest.fn()s.
 */

export const vexo = jest.fn();
export const enableTracking = jest.fn().mockResolvedValue(undefined);
export const disableTracking = jest.fn().mockResolvedValue(undefined);
export const customEvent = jest.fn();
export const trackScreen = jest.fn();
export const trackError = jest.fn();
export const identifyDevice = jest.fn();
export const registerProperties = jest.fn();
export const setHeatmapSegment = jest.fn();

/** Renders nothing — masking has no meaning outside a native replay. */
export function VexoMask({ children }: { children?: unknown }): null {
  return null;
}

/** Renders nothing. */
export function VexoUnmask({ children }: { children?: unknown }): null {
  return null;
}

/** Renders nothing. */
export function VexoProvider({ children }: { children?: unknown }): null {
  return null;
}
