/** DTO + event types shared by the chat UI and the thin API routes it calls. */

export interface ConversationDto {
  id: string;
  title: string;
  collectionId: string | null;
  updatedAt: string;
}

export interface CollectionOption {
  id: string;
  name: string;
}

/** One citation attached to an assistant message. */
export interface ChatCitation {
  ordinal: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  /** Exact cited span; null until the persisted record has been loaded. */
  citedText: string | null;
  startPage: number | null;
  endPage: number | null;
}

/** Persisted message as returned by GET /api/conversations/[id]. */
export interface ChatMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  guardrailFlags: unknown;
  citations: ChatCitation[];
}

/** GET /api/conversations/[id] response body. */
export interface ConversationDetailDto extends ConversationDto {
  messages: ChatMessageDto[];
}

/** GET /api/chunks/[id] response body — powers the source viewer. */
export interface ChunkDto {
  id: string;
  content: string;
  headingPath: string[];
  pageStart: number | null;
  pageEnd: number | null;
  documentTitle: string;
  sourceType: "upload" | "url";
  sourceUrl: string | null;
}

/** SSE frames emitted by POST /api/chat (shape defined in src/lib/rag/chat.ts). */
export type ChatSseEvent =
  | { type: "guardrail_blocked"; category: string }
  | { type: "text"; delta: string }
  | {
      type: "citation";
      ordinal: number;
      chunkId: string;
      documentId: string;
      documentTitle: string;
      page: number | null;
    }
  | { type: "done"; messageId: string; conversationId: string }
  | { type: "error"; message: string };

export interface ApiErrorResponse {
  error: string;
}

/**
 * Extracts the guardrail block category from a message's guardrailFlags,
 * or null when the message was not blocked. Defensive: flags is untyped jsonb.
 */
export function blockedCategoryOf(flags: unknown): string | null {
  if (typeof flags !== "object" || flags === null || !("input" in flags)) {
    return null;
  }
  const input = (flags as { input?: unknown }).input;
  if (typeof input !== "object" || input === null) return null;
  const verdict = input as { allowed?: unknown; category?: unknown };
  if (verdict.allowed !== false) return null;
  return typeof verdict.category === "string" ? verdict.category : "blocked";
}
