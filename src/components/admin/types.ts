/** DTO types + constants shared by the admin UI and the thin /api/admin routes. */

import type { DocumentStatus } from "@/components/documents/types";

export type { ApiErrorResponse } from "@/components/documents/types";

/**
 * ESTIMATES — update when pricing changes.
 * USD per million tokens for the generation model (claude-opus-5).
 */
export const PRICING_USD_PER_MTOK = {
  input: 5,
  output: 25,
  cacheRead: 0.5,
  cacheWrite: 6.25,
} as const;

/** GET /api/admin/stats */
export interface AdminStatsDto {
  /** Document counts per pipeline status (zero-filled for absent statuses). */
  documents: Record<DocumentStatus, number>;
  totalChunks: number;
  conversations: number;
  messagesLast7Days: number;
  feedback: { up: number; down: number };
}

/** GET /api/admin/ingestion-health — one failed or stuck document. */
export interface IngestionHealthDto {
  id: string;
  title: string;
  collectionName: string;
  status: DocumentStatus;
  /** failed = terminal failure; stuck = non-terminal with no job activity for 30+ min. */
  reason: "failed" | "stuck";
  stage: string | null;
  /** Latest job progress, normalized to 0–100 (null when no job exists yet). */
  progress: number | null;
  error: string | null;
  createdAt: string;
}

/** GET /api/admin/guardrail-flags — one flagged message. */
export interface GuardrailFlagDto {
  messageId: string;
  createdAt: string;
  conversationTitle: string;
  role: "user" | "assistant";
  /** Human-readable summary labels, e.g. "blocked: prompt_injection", "secret leak", "uncited". */
  flags: string[];
  content: string;
  /** Raw retrieval_debug jsonb for assistant messages (pretty-printed client-side). */
  retrievalDebug: unknown;
}

/** GET /api/admin/usage — one day of message/token aggregates. */
export interface UsageDayDto {
  /** YYYY-MM-DD (UTC). */
  date: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Derived from PRICING_USD_PER_MTOK — an estimate, not a bill. */
  estimatedCostUsd: number;
}

/** GET /api/admin/feedback — one feedback row for triage. */
export interface AdminFeedbackDto {
  id: string;
  rating: "up" | "down";
  comment: string | null;
  messageId: string;
  messagePreview: string;
  conversationTitle: string;
  userEmail: string;
  promotedToEvalCase: boolean;
  createdAt: string;
}

/** 201 body from POST /api/admin/feedback/[id]/promote. */
export interface PromoteResponse {
  evalCaseId: string;
}
