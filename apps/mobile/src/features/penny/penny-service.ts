/**
 * PennyService — the seam between Penny's UI and the Help The Hive backend.
 *
 *     React Native  →  Help The Hive backend  →  Penny agent / router
 *                   →  safety / tools / verified data  →  LLM provider
 *
 * The provider is deliberately absent from this file. No OpenAI, Anthropic or
 * Gemini client, no model name, no API key — swapping providers is a server-side
 * decision that never touches the app. The UI knows about conversations and
 * messages, and nothing else.
 *
 * Safety rules (allergen handling, no eligibility determinations, no medical,
 * legal or investment advice, never claiming an application was submitted) are
 * enforced by the backend, twice: once as instructions to the model and once as
 * an output guard that replaces a response breaking them. This app renders what
 * comes back, including refusals and fallbacks, without paraphrasing them.
 *
 * One rule for anyone editing this file: a `proposedAction` is a question, not a
 * result. Penny has done nothing when one arrives. Confirming it is a separate,
 * explicit call the user has to make, and sending that call automatically would
 * defeat the point of the whole mechanism.
 */
import { getGraphQLAuthToken } from '@/auth/auth-client';
import { apiBaseUrl } from '@/constants/env';
import { ApiError } from '@/services/api-error';

export type PennyRole = 'user' | 'penny';

/** Provenance for anything Penny said about a benefits program. */
export type PennyCitation = {
  title: string;
  heading?: string;
  program: string;
  jurisdiction: string;
  source_url?: string;
  /** True when the guidance is past its review date; show the date with it. */
  stale: boolean;
  reviewed_through?: string;
};

/**
 * A write Penny wants to make and has not made. The app renders it as a
 * confirmation card; nothing has happened until the user taps it.
 */
export type PennyProposedAction = {
  id: string;
  tool: string;
  /** Written by the server, not the model. Safe to show verbatim. */
  summary: string;
};

export type PennyMessage = {
  id: string;
  conversationId: string;
  role: PennyRole;
  text: string;
  /** ISO-8601. */
  createdAt: string;
  /** Set when the backend declined or failed, so the UI can offer a retry. */
  isError?: boolean;
  citations?: PennyCitation[];
  proposedAction?: PennyProposedAction;
};

export type PennyConversation = {
  id: string;
  title: string;
  updatedAt: string;
};

export type SendMessageInput = {
  conversationId: string | null;
  text: string;
  signal?: AbortSignal;
};

export type SendMessageResult = {
  conversationId: string;
  message: PennyMessage;
};

export type PennyService = {
  listConversations(): Promise<PennyConversation[]>;
  getMessages(conversationId: string): Promise<PennyMessage[]>;
  /** Sends a message; a null conversationId starts a new conversation. */
  send(input: SendMessageInput): Promise<SendMessageResult>;
  /**
   * Streams a reply. `onChunk` receives text as it is written — a preview, not
   * the answer: the backend's output guard runs on the finished response, so the
   * resolved result is authoritative and may differ from what was streamed.
   * Render the resolved message when it arrives rather than keeping the chunks.
   */
  stream(input: SendMessageInput, onChunk: (text: string) => void): Promise<SendMessageResult>;
  /** Performs an action Penny proposed, after the user has agreed to it. */
  confirmAction(actionId: string): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
};

type MessageBody = {
  id: string;
  conversationId: string;
  role: PennyRole;
  text: string;
  createdAt: string;
  isError?: boolean;
  citations?: PennyCitation[];
  proposedAction?: PennyProposedAction;
};

const pennyUrl = (path: string) => `${apiBaseUrl}/penny${path}`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getGraphQLAuthToken();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Maps a response onto the error kinds the UI already knows how to render. */
function errorFor(status: number, body: string): ApiError {
  const message = (() => {
    try {
      const parsed = JSON.parse(body) as { error?: string };
      return parsed.error ?? '';
    } catch {
      return '';
    }
  })();

  switch (status) {
    case 401:
      return new ApiError('unauthorized', message || 'Session expired', { status });
    case 403:
      return new ApiError('forbidden', message || 'Not allowed', { status });
    case 404:
      return new ApiError('not_found', message || 'Not found', { status });
    case 400:
      return new ApiError('validation', message || 'That message could not be sent', { status });
    case 429:
      return new ApiError('rate_limited', message || 'Too many messages', { status });
    default:
      return new ApiError(status >= 500 ? 'server' : 'unknown', message || 'Penny is unavailable', { status });
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(pennyUrl(path), { ...init, headers: { ...(await authHeaders()), ...init.headers } });
  } catch (cause) {
    throw new ApiError('network', 'Could not reach Help The Hive', { cause });
  }

  const body = await response.text();
  if (!response.ok) {
    throw errorFor(response.status, body);
  }
  return (body ? JSON.parse(body) : null) as T;
}

function toMessage(body: MessageBody): PennyMessage {
  return {
    id: body.id,
    conversationId: body.conversationId,
    role: body.role,
    text: body.text,
    createdAt: body.createdAt,
    isError: body.isError,
    citations: body.citations,
    proposedAction: body.proposedAction,
  };
}

export const pennyService: PennyService = {
  async listConversations() {
    const body = await request<{ id: string; title: string; updatedAt: string }[]>('/conversations');
    return body ?? [];
  },

  async getMessages(conversationId) {
    const body = await request<MessageBody[]>(`/conversations/${encodeURIComponent(conversationId)}/messages`);
    return (body ?? []).map(toMessage);
  },

  async send({ conversationId, text, signal }) {
    const body = await request<{ conversationId: string; message: MessageBody }>('/messages', {
      method: 'POST',
      body: JSON.stringify({ conversationId, text }),
      signal,
    });
    return { conversationId: body.conversationId, message: toMessage(body.message) };
  },

  async stream({ conversationId, text, signal }, onChunk) {
    let response: Response;
    try {
      response = await fetch(pennyUrl('/messages/stream'), {
        method: 'POST',
        headers: { ...(await authHeaders()), Accept: 'text/event-stream' },
        body: JSON.stringify({ conversationId, text }),
        signal,
      });
    } catch (cause) {
      throw new ApiError('network', 'Could not reach Help The Hive', { cause });
    }

    if (!response.ok) {
      throw errorFor(response.status, await response.text());
    }
    // React Native's fetch does not always expose a readable body. Falling back
    // to a non-streaming send is better than failing: the user waits a little
    // longer and still gets their answer.
    if (!response.body) {
      return pennyService.send({ conversationId, text, signal });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: SendMessageResult | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line; a partial one stays in the buffer.
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
        const data = /^data:\s*(.+)$/m.exec(frame)?.[1];
        if (!event || !data) continue;

        if (event === 'delta') {
          onChunk((JSON.parse(data) as { text: string }).text);
        } else if (event === 'message') {
          const payload = JSON.parse(data) as { conversationId: string; message: MessageBody };
          result = { conversationId: payload.conversationId, message: toMessage(payload.message) };
        } else if (event === 'error') {
          const payload = JSON.parse(data) as { status: number; message: string };
          throw errorFor(payload.status, JSON.stringify({ error: payload.message }));
        }
      }
    }

    if (!result) {
      // The stream ended without a final message. Whatever was shown is not an
      // answer, and treating it as one would leave a truncated reply on screen.
      throw new ApiError('server', 'Penny stopped part-way through');
    }
    return result;
  },

  async confirmAction(actionId) {
    await request(`/actions/${encodeURIComponent(actionId)}/confirm`, { method: 'POST' });
  },

  async deleteConversation(conversationId) {
    await request(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
  },
};

/** Suggested openers, matching the reference app's four prompts. */
export const PENNY_SUGGESTIONS = [
  'I need to find the closest resources to me.',
  'Create me meals from what I have in my fridge and pantry.',
  'I need to add items to my fridge and pantry.',
  'How can I lower my gas bill?',
] as const;

/**
 * Required disclaimer. Shown before the user's first message and kept reachable
 * in the conversation afterwards.
 */
export const PENNY_DISCLAIMER =
  'Penny AI provides general information only. It is not medical, financial, or ' +
  "professional advice, and may not reflect Help The Hive's views or always be accurate.";
