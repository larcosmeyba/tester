/**
 * VideoImportService — the seam between the video-import UI and the backend.
 *
 * The engine lives on the server: fetching the video, transcribing it,
 * extracting the recipe, and resolving ingredients against the catalogue all
 * happen there. This app collects a link, starts the job, polls for the
 * draft, and accepts it — rendering what comes back, never inventing a recipe.
 *
 * `useMockServices` still routes to a local stub so the screens can be worked
 * on without a server running. It is never on in a production build.
 */
import { graphqlClient } from '@/graphql/client';
import { useMockServices } from '@/constants/env';
import { toApiError } from '@/services/graphql-error';
import { toWireShape } from '@/features/meals/graphql-wire';
import { recipeSchema, type Recipe } from '@/features/meals/recipe-model';
import {
  AcceptRecipeImportDocument,
  CancelRecipeImportDocument,
  ImportRecipeFromVideoDocument,
  RecipeImportDocument,
  type AcceptRecipeImportPatch,
  type RecipeImportResult,
} from '@/features/meals/video-import-operations';

export type VideoImportStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type VideoImport = {
  importId: string;
  sourceUrl: string;
  sourcePlatform: string;
  status: VideoImportStatus;
  /** The extracted recipe once status is `succeeded`. Never fabricated. */
  draft: Recipe | null;
  recipeId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type AcceptImportInput = AcceptRecipeImportPatch;

export type PollOptions = {
  /** How often to re-ask the server. Defaults to 2.5s. */
  intervalMs?: number;
  /** Give up polling after this long; the import keeps running server-side. */
  timeoutMs?: number;
  onStatus?: (status: VideoImportStatus) => void;
  signal?: AbortSignal;
};

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 120_000;

function parseImport(payload: NonNullable<RecipeImportResult['recipeImport']>): VideoImport {
  // toWireShape converts the server's camelCase keys to the snake_case wire
  // shape the zod schemas parse; the draft goes through recipeSchema so a
  // malformed draft fails here rather than rendering as undefined later.
  const wire = toWireShape(payload) as {
    import_id?: unknown;
    source_url?: unknown;
    source_platform?: unknown;
    status?: unknown;
    draft?: unknown;
    recipe_id?: string | null;
    error_code?: string | null;
    error_message?: string | null;
  };
  return {
    importId: String(wire.import_id ?? ''),
    sourceUrl: String(wire.source_url ?? ''),
    sourcePlatform: String(wire.source_platform ?? ''),
    status: String(wire.status ?? 'running') as VideoImportStatus,
    draft: wire.draft ? recipeSchema.parse(wire.draft) : null,
    recipeId: wire.recipe_id ?? null,
    errorCode: wire.error_code ?? null,
    errorMessage: wire.error_message ?? null,
  };
}

/**
 * The named failures the schema documents. They are codes, not display text —
 * the app turns them into sentences here so no screen invents its own copy.
 */
export function videoImportFailureMessage(errorCode: string | null, errorMessage: string | null): string {
  switch (errorCode) {
    case 'UNSUPPORTED_SOURCE':
      return 'That link is from a site we can\u2019t import from yet. Try a TikTok, Instagram Reel, or YouTube link.';
    case 'VIDEO_UNAVAILABLE':
      return 'We couldn\u2019t open that video. It may be private, deleted, or the link may be wrong.';
    case 'VIDEO_TOO_LONG':
      return 'That video is too long to transcribe into a recipe. Try a shorter one.';
    case 'NO_TRANSCRIPT':
      return 'We couldn\u2019t get a transcript for that video — some videos don\u2019t have captions or audio we can read.';
    case 'NO_RECIPE_FOUND':
      return 'We watched the whole thing but couldn\u2019t find a recipe in it. Try a cooking video with spoken or captioned steps.';
    case 'PROVIDER_ERROR':
      return 'Our video service hiccuped. Please try again in a bit.';
    default:
      return errorMessage?.trim()
        ? errorMessage
        : 'Something went wrong importing that video. Please try again.';
  }
}

/**
 * Light client-side sanity check only. Which hosts are supported is decided
 * server-side — this just rejects obvious non-links before a network call.
 */
export function looksLikeVideoLink(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return /^(https?:\/\/|www\.)/i.test(trimmed);
}

export type VideoImportService = {
  /** Starts the import. Resolves with the import id to poll. */
  start(url: string): Promise<{ importId: string; sourcePlatform: string }>;
  /** One status check. */
  get(importId: string): Promise<VideoImport | null>;
  /**
   * Polls until the import reaches a terminal state. Resolves with the final
   * import; rejects on timeout (the import keeps running server-side).
   */
  poll(importId: string, options?: PollOptions): Promise<VideoImport>;
  /** Stops an import that has not finished. */
  cancel(importId: string): Promise<void>;
  /**
   * Accepts a succeeded draft and saves it as one of the viewer's recipes.
   * `input` patches only what the video never stated (servings, per-line
   * quantity/unit); everything else comes from the draft.
   */
  accept(importId: string, input?: AcceptImportInput): Promise<{ recipeId: string; title: string }>;
};

const graphqlVideoImportService: VideoImportService = {
  async start(url) {
    try {
      const result = await graphqlClient.request(ImportRecipeFromVideoDocument, {
        input: { url: url.trim() },
      });
      return {
        importId: result.importRecipeFromVideo.importId,
        sourcePlatform: result.importRecipeFromVideo.sourcePlatform,
      };
    } catch (error) {
      throw toApiError(error);
    }
  },

  async get(importId) {
    try {
      const result = await graphqlClient.request(RecipeImportDocument, { importId });
      return result.recipeImport ? parseImport(result.recipeImport) : null;
    } catch (error) {
      throw toApiError(error);
    }
  },

  async poll(importId, options = {}) {
    const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
    const startedAt = Date.now();

    for (;;) {
      if (options.signal?.aborted) {
        throw toApiError(new Error('Import polling was cancelled.'));
      }
      const current = await this.get(importId);
      if (!current) {
        throw toApiError(new Error('That import is no longer available.'));
      }
      options.onStatus?.(current.status);
      if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'cancelled') {
        return current;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw toApiError(
          new Error('This is taking longer than expected — the import is still running and you can check back shortly.')
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  },

  async cancel(importId) {
    try {
      await graphqlClient.request(CancelRecipeImportDocument, { importId });
    } catch (error) {
      throw toApiError(error);
    }
  },

  async accept(importId, input) {
    try {
      const result = await graphqlClient.request(AcceptRecipeImportDocument, {
        importId,
        input: input ?? null,
      });
      return {
        recipeId: result.acceptRecipeImport.recipeId,
        title: result.acceptRecipeImport.title,
      };
    } catch (error) {
      throw toApiError(error);
    }
  },
};

/** Development stub: walks queued → running → succeeded with a canned draft. */
const mockVideoImportService: VideoImportService = {
  async start() {
    return { importId: 'mock-import-1', sourcePlatform: 'tiktok' };
  },
  async get() {
    return {
      importId: 'mock-import-1',
      sourceUrl: 'https://www.tiktok.com/mock',
      sourcePlatform: 'tiktok',
      status: 'succeeded',
      draft: null,
      recipeId: null,
      errorCode: null,
      errorMessage: null,
    };
  },
  async poll(importId, options = {}) {
    options.onStatus?.('queued');
    await new Promise((resolve) => setTimeout(resolve, 300));
    options.onStatus?.('running');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const done = await this.get(importId);
    if (!done) throw new Error('That import is no longer available.');
    options.onStatus?.(done.status);
    return done;
  },
  async cancel() {},
  async accept() {
    return { recipeId: 'mock-recipe-1', title: 'Mock imported recipe' };
  },
};

export const videoImportService: VideoImportService = useMockServices
  ? mockVideoImportService
  : graphqlVideoImportService;
