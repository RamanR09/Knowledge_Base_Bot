/** DTO types shared by the documents UI and the thin API routes it calls. */

export type DocumentStatus =
  | "pending"
  | "parsing"
  | "chunking"
  | "embedding"
  | "ready"
  | "failed";

export type SourceType = "upload" | "url";

export const TERMINAL_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  "ready",
  "failed",
]);

export interface CollectionDto {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: string;
}

/** Latest ingestion_jobs row for a document, if any. */
export interface IngestionJobDto {
  stage: string;
  progress: number;
  error: string | null;
}

export interface DocumentDto {
  id: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  status: DocumentStatus;
  error: string | null;
  pageCount: number | null;
  chunkCount: number | null;
  createdAt: string;
  job: IngestionJobDto | null;
}

/** 202 body from POST /api/upload and POST /api/documents/url. */
export interface EnqueueResponse {
  documentId: string;
  queued: boolean;
}

export interface ApiErrorResponse {
  error: string;
}
