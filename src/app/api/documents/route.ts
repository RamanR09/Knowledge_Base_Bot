import { NextRequest, NextResponse } from "next/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documentChunks, documents, ingestionJobs } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../_helpers/errors";

const collectionIdSchema = z.uuid("A valid collectionId is required");

export async function GET(req: NextRequest) {
  try {
    await requireSessionUser();
    const collectionId = collectionIdSchema.parse(
      req.nextUrl.searchParams.get("collectionId"),
    );

    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        sourceType: documents.sourceType,
        sourceUrl: documents.sourceUrl,
        status: documents.status,
        error: documents.error,
        pageCount: documents.pageCount,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.collectionId, collectionId))
      .orderBy(desc(documents.createdAt));

    const ids = docs.map((doc) => doc.id);
    const latestJobByDoc = new Map<
      string,
      { stage: string; progress: number; error: string | null }
    >();
    const chunkCountByDoc = new Map<string, number>();

    if (ids.length > 0) {
      // Latest ingestion_jobs row per document (rows come back newest-first).
      const jobs = await db
        .select({
          documentId: ingestionJobs.documentId,
          stage: ingestionJobs.stage,
          progress: ingestionJobs.progress,
          error: ingestionJobs.error,
        })
        .from(ingestionJobs)
        .where(inArray(ingestionJobs.documentId, ids))
        .orderBy(desc(ingestionJobs.createdAt));
      for (const job of jobs) {
        if (!latestJobByDoc.has(job.documentId)) {
          latestJobByDoc.set(job.documentId, {
            stage: job.stage,
            progress: Number(job.progress),
            error: job.error,
          });
        }
      }

      const chunkCounts = await db
        .select({
          documentId: documentChunks.documentId,
          chunkCount: count(),
        })
        .from(documentChunks)
        .where(inArray(documentChunks.documentId, ids))
        .groupBy(documentChunks.documentId);
      for (const row of chunkCounts) {
        chunkCountByDoc.set(row.documentId, row.chunkCount);
      }
    }

    return NextResponse.json(
      docs.map((doc) => ({
        ...doc,
        chunkCount: chunkCountByDoc.get(doc.id) ?? null,
        job: latestJobByDoc.get(doc.id) ?? null,
      })),
    );
  } catch (err) {
    return apiError(err);
  }
}
