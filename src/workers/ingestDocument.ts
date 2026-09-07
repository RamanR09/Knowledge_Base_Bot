import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collections, documentChunks, documents, ingestionJobs } from "@/db/schema";
import { chunkDocument } from "@/lib/ingestion/chunker";
import { contextualizeChunks } from "@/lib/ingestion/contextualize";
import { embedChunks } from "@/lib/ingestion/embed";
import { parseDocument, type ParseKind } from "@/lib/ingestion/parse";
import { detectInjectionPatterns, sanitizeText } from "@/lib/ingestion/sanitize";
import type { ParsedDocument } from "@/lib/ingestion/types";

const CHUNK_INSERT_BATCH = 100;
const ERROR_MAX_CHARS = 2000;

/** Collection `settings` is external JSON — zod-parse, default contextual on. */
const collectionSettingsSchema = z.object({
  contextualRetrieval: z.boolean().optional(),
});

const EXTENSION_KINDS: Record<string, ParseKind> = {
  ".pdf": "pdf",
  ".md": "md",
  ".markdown": "md",
  ".txt": "txt",
  ".docx": "docx",
  ".csv": "csv",
};

type DocumentRow = typeof documents.$inferSelect;

async function loadDocument(documentId: string): Promise<DocumentRow> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!doc) throw new Error(`Document ${documentId} not found`);
  return doc;
}

/** Update document status + ingestion job stage/progress in one place. */
async function setStage(
  documentId: string,
  status: "parsing" | "chunking" | "embedding" | null,
  stage: string,
  progress: number,
): Promise<void> {
  if (status) {
    await db
      .update(documents)
      .set({ status, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }
  await db
    .update(ingestionJobs)
    .set({
      stage,
      progress: String(progress),
      ...(stage === "parsing" ? { startedAt: new Date(), error: null } : {}),
    })
    .where(eq(ingestionJobs.documentId, documentId));
}

/** Record a terminal failure on the document + job rows (best effort). */
export async function recordFailure(documentId: string, err: unknown): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX_CHARS);
  try {
    await db
      .update(documents)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    await db
      .update(ingestionJobs)
      .set({ stage: "failed", error: message, finishedAt: new Date() })
      .where(eq(ingestionJobs.documentId, documentId));
  } catch {
    // Best effort — the original error is rethrown by the caller either way.
  }
}

async function contextualRetrievalEnabled(collectionId: string): Promise<boolean> {
  const [collection] = await db
    .select({ settings: collections.settings })
    .from(collections)
    .where(eq(collections.id, collectionId))
    .limit(1);
  if (!collection) return true;
  const parsed = collectionSettingsSchema.safeParse(collection.settings);
  return parsed.success ? parsed.data.contextualRetrieval !== false : true;
}

/**
 * Shared tail of the pipeline: chunk → sanitize/flag → (contextualize) →
 * embed → transactional chunk insert → ready. Used both by the upload worker
 * and per-page by the crawl worker.
 */
export async function processParsedDocument(
  documentId: string,
  parsed: ParsedDocument,
): Promise<void> {
  const doc = await loadDocument(documentId);

  await setStage(documentId, "chunking", "chunking", 0.3);
  const chunks = chunkDocument(parsed)
    .map((c) => ({ ...c, content: sanitizeText(c.content).trim() }))
    .filter((c) => c.content.length > 0)
    .map((c, i) => ({ ...c, chunkIndex: i }));

  let prefixes: string[] = chunks.map(() => "");
  if (chunks.length > 0 && (await contextualRetrievalEnabled(doc.collectionId))) {
    await setStage(documentId, null, "contextualizing", 0.45);
    const docText = parsed.blocks.map((b) => b.text).join("\n\n");
    prefixes = (await contextualizeChunks(docText, chunks)).map((p) =>
      sanitizeText(p).trim(),
    );
  }

  await setStage(documentId, "embedding", "embedding", 0.6);
  const embeddings = await embedChunks(
    chunks.map((c, i) => ({ content: c.content, contextPrefix: prefixes[i] })),
  );
  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedding count mismatch: ${embeddings.length} for ${chunks.length} chunks`);
  }

  // Delete-then-insert inside one transaction keeps re-runs idempotent.
  const rows = chunks.map((c, i) => ({
    documentId,
    collectionId: doc.collectionId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    contextPrefix: prefixes[i] || null,
    headingPath: c.headingPath,
    pageStart: c.pageStart ?? null,
    pageEnd: c.pageEnd ?? null,
    tokenCount: c.tokenCount,
    suspectedInjection: detectInjectionPatterns(c.content),
    embedding: embeddings[i],
  }));
  await db.transaction(async (tx) => {
    await tx.delete(documentChunks).where(eq(documentChunks.documentId, documentId));
    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      await tx.insert(documentChunks).values(rows.slice(i, i + CHUNK_INSERT_BATCH));
    }
  });

  const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  await db
    .update(documents)
    .set({
      status: "ready",
      error: null,
      pageCount: parsed.pageCount ?? doc.pageCount,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
  await db
    .update(ingestionJobs)
    .set({
      stage: "ready",
      progress: "1",
      stats: { chunks: chunks.length, tokens: totalTokens },
      finishedAt: new Date(),
      error: null,
    })
    .where(eq(ingestionJobs.documentId, documentId));
}

function kindFromFilePath(filePath: string): ParseKind {
  const ext = path.extname(filePath).toLowerCase();
  const kind = EXTENSION_KINDS[ext];
  if (!kind) throw new Error(`Cannot determine parser for file extension "${ext}"`);
  return kind;
}

/**
 * `ingest-document` handler: staged state machine for one uploaded document
 * (pending → parsing → chunking → embedding → ready | failed). Errors are
 * recorded on the document + job rows, then rethrown so pg-boss retries.
 */
export async function handleIngestDocument(documentId: string): Promise<void> {
  try {
    const doc = await loadDocument(documentId);
    await setStage(documentId, "parsing", "parsing", 0.1);

    if (!doc.filePath) {
      throw new Error("Document has no stored file to parse");
    }
    const kind = kindFromFilePath(doc.filePath);
    const data = await readFile(doc.filePath);
    const parsed = await parseDocument(kind, data, doc.title);

    await processParsedDocument(documentId, parsed);
  } catch (err) {
    await recordFailure(documentId, err);
    throw err;
  }
}
