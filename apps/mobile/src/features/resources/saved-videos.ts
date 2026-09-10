/**
 * Saved videos — the "Save Video" button on the video detail screen.
 *
 * There is no backend field for saved videos yet, so the saved set lives in
 * AsyncStorage on the device. It survives restarts; when a backend field
 * lands, this module is the seam to swap out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hth.savedVideoIds.v1';

async function readIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

async function writeIds(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Saving is best-effort on device; a failed write must not break the UI.
  }
}

/** The ids of all saved videos. */
export async function loadSavedVideoIds(): Promise<Set<string>> {
  return readIds();
}

/**
 * Toggles the saved state of one video. Returns the new state
 * (true = now saved).
 */
export async function toggleVideoSaved(videoId: string): Promise<boolean> {
  const ids = await readIds();
  const nowSaved = !ids.has(videoId);
  if (nowSaved) ids.add(videoId);
  else ids.delete(videoId);
  await writeIds(ids);
  return nowSaved;
}
