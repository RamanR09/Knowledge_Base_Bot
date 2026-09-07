/**
 * pg-boss worker boot. Run via `npm run worker` (tsx watch src/workers/index.ts).
 * Registers handlers for the ingestion queues and shuts down gracefully on
 * SIGTERM/SIGINT.
 */

import pino from "pino";
import type { z } from "zod";
import { env } from "@/lib/env";
import {
  CRAWL_URL_QUEUE,
  INGEST_DOCUMENT_QUEUE,
  crawlUrlJobSchema,
  getBoss,
  ingestDocumentJobSchema,
} from "@/lib/ingestion/boss";
import { handleCrawlUrl } from "./crawlUrl";
import { handleIngestDocument } from "./ingestDocument";

const logger = pino({ level: "info" });

interface QueueJob {
  id: string;
  data: object;
}

/** Wrap a handler with per-job logging; rethrow so pg-boss retries. */
function withLogging<S extends z.ZodType>(
  queue: string,
  schema: S,
  handler: (data: z.infer<S>) => Promise<void>,
): (jobs: QueueJob[]) => Promise<void> {
  return async (jobs) => {
    for (const job of jobs) {
      const startedAt = Date.now();
      logger.info({ queue, jobId: job.id }, "job started");
      try {
        const data = schema.parse(job.data);
        await handler(data);
        logger.info(
          { queue, jobId: job.id, durationMs: Date.now() - startedAt },
          "job finished",
        );
      } catch (err) {
        logger.error(
          {
            queue,
            jobId: job.id,
            durationMs: Date.now() - startedAt,
            error: err instanceof Error ? err.message : String(err),
          },
          "job failed",
        );
        throw err; // pg-boss retries up to the queue's retryLimit
      }
    }
  };
}

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV }, "ingestion worker starting");
  const boss = await getBoss();

  boss.on("error", (err: unknown) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "pg-boss error");
  });

  await boss.work(
    INGEST_DOCUMENT_QUEUE,
    { batchSize: 1 },
    withLogging(INGEST_DOCUMENT_QUEUE, ingestDocumentJobSchema, (data) =>
      handleIngestDocument(data.documentId),
    ),
  );
  await boss.work(
    CRAWL_URL_QUEUE,
    { batchSize: 1 },
    withLogging(CRAWL_URL_QUEUE, crawlUrlJobSchema, (data) => handleCrawlUrl(data)),
  );

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    void (async () => {
      try {
        await boss.stop({ graceful: true, close: true, timeout: 30_000 });
        logger.info("worker stopped cleanly");
        process.exit(0);
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "error during shutdown",
        );
        process.exit(1);
      }
    })();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  logger.info(
    { queues: [INGEST_DOCUMENT_QUEUE, CRAWL_URL_QUEUE] },
    "ingestion worker ready",
  );
}

main().catch((err: unknown) => {
  logger.error(
    { error: err instanceof Error ? err.message : String(err) },
    "worker failed to start",
  );
  process.exit(1);
});
