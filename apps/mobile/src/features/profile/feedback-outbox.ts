/**
 * Feedback outbox — In-App Feedback & Bug Reporting (ClickUp).
 *
 * Feedback is captured locally first, so a tap on "Send feedback" never loses
 * the message to a dead connection. Each entry is persisted to AsyncStorage
 * (feedback is not benefits data: it holds no household PII, so the encrypted
 * SecureStore is not required) with a created-at timestamp and a
 * pending/sent status. When the backend accepts an entry it is marked sent;
 * anything left pending stays queued across restarts until delivery succeeds.
 *
 * DELIVERY: there is no feedback endpoint on the Help The Hive backend yet, so
 * `flushFeedbackOutbox` is a stub with a clearly-marked TODO (see below). The
 * screen already shows "Saved — will send when you're back online / connected"
 * for anything still pending, so wiring the real mutation later is a matter of
 * implementing `deliverFeedbackEntry` and letting the outbox do the rest.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeedbackStatus = 'pending' | 'sent';

export interface FeedbackEntry {
  id: string;
  rating: number;
  category: string;
  message: string;
  /** ISO 8601 timestamp of when the entry was captured on device. */
  createdAt: string;
  status: FeedbackStatus;
  /** ISO 8601 timestamp of when the backend accepted the entry, if it did. */
  sentAt: string | null;
}

export type NewFeedbackEntry = Pick<FeedbackEntry, 'rating' | 'category' | 'message'>;

export interface FeedbackFlushResult {
  attempted: number;
  sent: number;
}

const OUTBOX_KEY = 'hth_feedback_outbox';
/** Enough for a steady reporter; the oldest entries are dropped past this. */
const OUTBOX_CAP = 50;

function isFeedbackEntry(value: unknown): value is FeedbackEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.rating === 'number' &&
    typeof entry.category === 'string' &&
    typeof entry.message === 'string' &&
    typeof entry.createdAt === 'string' &&
    (entry.status === 'pending' || entry.status === 'sent') &&
    (entry.sentAt === null || typeof entry.sentAt === 'string')
  );
}

async function readOutbox(): Promise<FeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedbackEntry);
  } catch {
    // A corrupted outbox is not worth crashing the settings screen over.
    return [];
  }
}

async function writeOutbox(entries: FeedbackEntry[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
}

/** Capture a feedback submission locally. It starts life as `pending`. */
export async function enqueueFeedback(entry: NewFeedbackEntry): Promise<FeedbackEntry> {
  const now = new Date().toISOString();
  const created: FeedbackEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    rating: Math.max(0, Math.min(5, Math.round(entry.rating))),
    category: entry.category,
    message: entry.message,
    createdAt: now,
    status: 'pending',
    sentAt: null,
  };
  const entries = [...(await readOutbox()), created];
  await writeOutbox(entries.slice(-OUTBOX_CAP));
  return created;
}

/** All queued entries, oldest first. */
export async function listFeedbackOutbox(): Promise<FeedbackEntry[]> {
  return readOutbox();
}

/** Mark an entry sent once the backend accepts it. */
export async function markFeedbackSent(id: string): Promise<void> {
  const entries = await readOutbox();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return;
  entry.status = 'sent';
  entry.sentAt = new Date().toISOString();
  await writeOutbox(entries);
}

export async function countPendingFeedback(): Promise<number> {
  return (await readOutbox()).filter((entry) => entry.status === 'pending').length;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * TODO(backend): implement this against the real feedback mutation once the
 * Help The Hive backend exposes one. This is the ONLY place delivery happens —
 * do not invent a REST endpoint or a GraphQL mutation name here; the outbox
 * keeps entries queued locally until a real path exists.
 *
 * When the backend is ready: replace the body with a call through the existing
 * service layer (e.g. `graphqlClient.request(SubmitFeedbackDocument, ...)`),
 * then `flushFeedbackOutbox` below will pick pending entries up automatically.
 */
async function deliverFeedbackEntry(_entry: FeedbackEntry): Promise<void> {
  throw new Error('No feedback delivery endpoint exists on the backend yet.');
}

/**
 * Attempt to deliver every pending entry. Entries the backend accepts are
 * marked sent; anything else stays queued for the next attempt. Safe to call
 * whenever connectivity is expected — on app foreground, on the feedback
 * screen's mount, and right after a submission.
 */
export async function flushFeedbackOutbox(): Promise<FeedbackFlushResult> {
  const entries = await readOutbox();
  const pending = entries.filter((entry) => entry.status === 'pending');
  if (pending.length === 0) return { attempted: 0, sent: 0 };

  let sent = 0;
  for (const entry of pending) {
    try {
      await deliverFeedbackEntry(entry);
      await markFeedbackSent(entry.id);
      sent += 1;
    } catch {
      // Leave it queued. The next flush (or the next submit) tries again.
      break;
    }
  }
  return { attempted: pending.length, sent };
}
