/**
 * PennyService — the seam between Penny's UI and whatever answers her.
 *
 * BACKEND INTEGRATION REQUIRED. Penny runs through the Help The Hive backend:
 *
 *     React Native  →  Help The Hive backend  →  Penny orchestrator
 *                   →  safety / tools / verified data  →  LLM provider
 *
 * The provider is deliberately absent from this file. No OpenAI, Anthropic or
 * Gemini client, no model name, no API key — swapping providers must be a
 * server-side decision that never touches the app. The UI only knows about
 * conversations and messages.
 *
 * Safety rules (allergen handling, no eligibility determinations, no medical,
 * legal or investment advice, never claiming an application was submitted) are
 * enforced by the backend. This app's job is to render what comes back,
 * including refusals and fallbacks, without paraphrasing them.
 */
import { BackendIntegrationRequiredError } from '@/services/api-error';

export type PennyRole = 'user' | 'penny';

export type PennyMessage = {
  id: string;
  conversationId: string;
  role: PennyRole;
  text: string;
  /** ISO-8601. */
  createdAt: string;
  /** Set when the backend declined or failed, so the UI can offer a retry. */
  isError?: boolean;
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
   * Streaming is how this should work once the backend supports it. Declared
   * now so the UI can be built against it rather than retrofitted.
   */
  stream?(
    input: SendMessageInput,
    onChunk: (text: string) => void
  ): Promise<SendMessageResult>;
};

export const pennyService: PennyService = {
  listConversations: () =>
    Promise.reject(new BackendIntegrationRequiredError('GET /penny/conversations')),
  getMessages: () =>
    Promise.reject(new BackendIntegrationRequiredError('GET /penny/conversations/{id}/messages')),
  send: () => Promise.reject(new BackendIntegrationRequiredError('POST /penny/messages')),
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
