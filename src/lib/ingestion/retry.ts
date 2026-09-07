import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, ingestionJobs } from "@/db/schema";
import { CRAWL_URL_QUEUE, INGEST_DOCUMENT_QUEUE, getBoss } from "./boss";

/**
 * Re-enqueue a failed document. Resets status and creates a fresh ingestion job.
 * Returns false when the document doesn't exist or isn't in a failed state.
 */
export async function retryDocument(documentId: string): Promise<boolean> {
  const [doc] = await db
    .select({
      id: documents.id,
      status: documents.status,
      sourceType: documents.sourceType,
      sourceUrl: documents.sourceUrl,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc || doc.status !== "failed") return false;

  await db
    .update(documents)
    .set({ status: "pending", error: null, updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  const [jobRow] = await db
    .insert(ingestionJobs)
    .values({ documentId: doc.id, stage: "queued" })
    .returning({ id: ingestionJobs.id });

  const boss = await getBoss();
  const pgBossJobId =
    doc.sourceType === "url" && doc.sourceUrl
      ? await boss.send(CRAWL_URL_QUEUE, {
          documentId: doc.id,
          url: doc.sourceUrl,
          crawl: false,
        })
      : await boss.send(INGEST_DOCUMENT_QUEUE, { documentId: doc.id });

  if (pgBossJobId) {
    await db
      .update(ingestionJobs)
      .set({ pgBossJobId })
      .where(eq(ingestionJobs.id, jobRow.id));
  }
  return true;
}
