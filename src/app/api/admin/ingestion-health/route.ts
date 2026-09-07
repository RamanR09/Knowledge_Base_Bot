import { NextResponse } from "next/server";
import { desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { collections, documents, ingestionJobs } from "@/db/schema";
import type { IngestionHealthDto } from "@/components/admin/types";
import { apiError } from "../../_helpers/errors";
import { requireAdmin } from "../_helpers/auth";

/** Non-terminal documents with no job activity for this long count as stuck. */
const STUCK_AFTER_MS = 30 * 60 * 1000;

/** Normalize a numeric job progress (0–1 or 0–100) to 0–100. */
function toPercent(progress: string): number {
  const value = Number(progress);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

export async function GET() {
  try {
    await requireAdmin();

    // Everything not ready: failed docs plus candidates for "stuck".
    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
        error: documents.error,
        createdAt: documents.createdAt,
        collectionName: collections.name,
      })
      .from(documents)
      .innerJoin(collections, eq(documents.collectionId, collections.id))
      .where(ne(documents.status, "ready"))
      .orderBy(desc(documents.createdAt));

    // Latest ingestion_jobs row per document (rows come back newest-first).
    const ids = docs.map((doc) => doc.id);
    const latestJobByDoc = new Map<
      string,
      { stage: string; progress: string; error: string | null; createdAt: Date }
    >();
    if (ids.length > 0) {
      const jobs = await db
        .select({
          documentId: ingestionJobs.documentId,
          stage: ingestionJobs.stage,
          progress: ingestionJobs.progress,
          error: ingestionJobs.error,
          createdAt: ingestionJobs.createdAt,
        })
        .from(ingestionJobs)
        .where(inArray(ingestionJobs.documentId, ids))
        .orderBy(desc(ingestionJobs.createdAt));
      for (const job of jobs) {
        if (!latestJobByDoc.has(job.documentId)) {
          latestJobByDoc.set(job.documentId, job);
        }
      }
    }

    const cutoff = Date.now() - STUCK_AFTER_MS;
    const rows: IngestionHealthDto[] = [];
    for (const doc of docs) {
      const job = latestJobByDoc.get(doc.id) ?? null;
      let reason: IngestionHealthDto["reason"];
      if (doc.status === "failed") {
        reason = "failed";
      } else {
        // Stuck = non-terminal with the latest job (or, lacking any job row,
        // the document itself) created more than 30 minutes ago.
        const anchor = job ? job.createdAt : doc.createdAt;
        if (anchor.getTime() > cutoff) continue;
        reason = "stuck";
      }
      rows.push({
        id: doc.id,
        title: doc.title,
        collectionName: doc.collectionName,
        status: doc.status,
        reason,
        stage: job?.stage ?? null,
        progress: job ? toPercent(job.progress) : null,
        error: doc.error ?? job?.error ?? null,
        createdAt: doc.createdAt.toISOString(),
      });
    }
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}
