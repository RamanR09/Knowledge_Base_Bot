/**
 * Public contract between the upload/URL API routes (frontend-builder scope)
 * and the ingestion pipeline (rag-engineer scope).
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { documents, ingestionJobs } from "@/db/schema";
import { env } from "@/lib/env";
import { CRAWL_URL_QUEUE, INGEST_DOCUMENT_QUEUE, getBoss } from "./boss";
import { sha256, validateUpload } from "./validate";

export interface EnqueueUploadInput {
  /** Raw file bytes. */
  data: Buffer;
  filename: string;
  mimeType: string;
  collectionId: string;
  userId: string;
}

export interface EnqueueResult {
  documentId: string;
  /** False when an identical document (same content hash) already exists — no job queued. */
  queued: boolean;
}

export interface EnqueueUrlInput {
  url: string;
  /** Crawl the site (sitemap-aware, same-origin) vs scrape the single page. */
  crawl: boolean;
  collectionId: string;
  userId: string;
}

/** Non-failed document with this content hash in this collection, if any. */
async function findExisting(collectionId: string, contentHash: string) {
  const [existing] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.collectionId, collectionId),
        eq(documents.contentHash, contentHash),
        ne(documents.status, "failed"),
      ),
    )
    .limit(1);
  return existing;
}

async function sendJob(
  queue: typeof INGEST_DOCUMENT_QUEUE | typeof CRAWL_URL_QUEUE,
  payload: object,
  ingestionJobId: string,
): Promise<void> {
  const boss = await getBoss();
  const pgBossJobId = await boss.send(queue, payload);
  if (pgBossJobId) {
    await db
      .update(ingestionJobs)
      .set({ pgBossJobId })
      .where(eq(ingestionJobs.id, ingestionJobId));
  }
}

export async function enqueueUpload(input: EnqueueUploadInput): Promise<EnqueueResult> {
  const verdict = await validateUpload(input.data, input.filename, input.mimeType);
  if (!verdict.ok) {
    throw new Error(`Invalid upload: ${verdict.reason}`);
  }

  const contentHash = sha256(input.data);
  const existing = await findExisting(input.collectionId, contentHash);
  if (existing) {
    return { documentId: existing.id, queued: false };
  }

  await mkdir(env.UPLOAD_DIR, { recursive: true });
  const filePath = path.join(env.UPLOAD_DIR, `${randomUUID()}.${verdict.kind}`);
  await writeFile(filePath, input.data);

  const [doc] = await db
    .insert(documents)
    .values({
      collectionId: input.collectionId,
      sourceType: "upload",
      title: input.filename,
      filePath,
      mimeType: input.mimeType,
      contentHash,
      status: "pending",
      createdBy: input.userId,
    })
    .returning({ id: documents.id });

  const [jobRow] = await db
    .insert(ingestionJobs)
    .values({ documentId: doc.id, stage: "queued" })
    .returning({ id: ingestionJobs.id });

  await sendJob(INGEST_DOCUMENT_QUEUE, { documentId: doc.id }, jobRow.id);
  return { documentId: doc.id, queued: true };
}

/** For crawls, one parent job fans out into per-page documents as pages are discovered. */
export async function enqueueUrl(input: EnqueueUrlInput): Promise<EnqueueResult> {
  // Hash of the URL string stands in for a content hash so re-adding the same
  // URL to a collection dedupes instead of double-ingesting.
  const contentHash = sha256(Buffer.from(input.url, "utf8"));
  const existing = await findExisting(input.collectionId, contentHash);
  if (existing) {
    return { documentId: existing.id, queued: false };
  }

  const [doc] = await db
    .insert(documents)
    .values({
      collectionId: input.collectionId,
      sourceType: "url",
      title: input.url,
      sourceUrl: input.url,
      contentHash,
      status: "pending",
      createdBy: input.userId,
    })
    .returning({ id: documents.id });

  const [jobRow] = await db
    .insert(ingestionJobs)
    .values({ documentId: doc.id, stage: "queued" })
    .returning({ id: ingestionJobs.id });

  await sendJob(
    CRAWL_URL_QUEUE,
    { documentId: doc.id, url: input.url, crawl: input.crawl },
    jobRow.id,
  );
  return { documentId: doc.id, queued: true };
}
