import { PgBoss } from "pg-boss";
import { z } from "zod";
import { env } from "@/lib/env";

/** Queue names — the single source of truth for both senders and workers. */
export const INGEST_DOCUMENT_QUEUE = "ingest-document";
export const CRAWL_URL_QUEUE = "crawl-url";

/** Failed jobs are retried twice before the document stays `failed`. */
const RETRY_LIMIT = 2;

export const ingestDocumentJobSchema = z.object({
  documentId: z.uuid(),
});
export type IngestDocumentJobData = z.infer<typeof ingestDocumentJobSchema>;

export const crawlUrlJobSchema = z.object({
  documentId: z.uuid(),
  url: z.url(),
  crawl: z.boolean(),
});
export type CrawlUrlJobData = z.infer<typeof crawlUrlJobSchema>;

let bossPromise: Promise<PgBoss> | undefined;

async function initBoss(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL);
  await boss.start();
  // createQueue is an idempotent upsert in pg-boss v10+.
  await boss.createQueue(INGEST_DOCUMENT_QUEUE, {
    retryLimit: RETRY_LIMIT,
    retryDelay: 30,
    retryBackoff: true,
  });
  await boss.createQueue(CRAWL_URL_QUEUE, {
    retryLimit: RETRY_LIMIT,
    retryDelay: 30,
    retryBackoff: true,
  });
  return boss;
}

/** Lazy singleton PgBoss instance (started, queues created). */
export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = initBoss().catch((err: unknown) => {
      bossPromise = undefined; // allow a later retry after a failed init
      throw err;
    });
  }
  return bossPromise;
}
