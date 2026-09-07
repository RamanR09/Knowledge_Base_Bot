/**
 * Minimal pg-boss v12 lifecycle check against our Postgres version: start,
 * createQueue, send, work receives the payload, job completes, graceful stop.
 * Proves the single-database job-queue infrastructure works on pg17+pgvector.
 */
import { PgBoss } from "pg-boss";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SKIP_MESSAGE, tryStartPostgres } from "./container";

let container: StartedPostgreSqlContainer | null = null;

beforeAll(async () => {
  container = await tryStartPostgres();
}, 180_000);

afterAll(async () => {
  await container?.stop();
}, 60_000);

describe("pg-boss against pgvector/pgvector:pg17", () => {
  it("delivers a job payload to a worker and marks it completed", async (ctx) => {
    if (!container) return ctx.skip(SKIP_MESSAGE);

    const boss = new PgBoss({ connectionString: container.getConnectionUri() });
    const errors: Error[] = [];
    boss.on("error", (err: unknown) =>
      errors.push(err instanceof Error ? err : new Error(String(err))),
    );

    try {
      await boss.start();

      const queue = "integration-smoke-queue";
      await boss.createQueue(queue);

      let resolveReceived!: (data: { documentId: string }) => void;
      const received = new Promise<{ documentId: string }>((resolve) => {
        resolveReceived = resolve;
      });
      await boss.work<{ documentId: string }>(
        queue,
        async (jobs: { data: { documentId: string } }[]) => {
          for (const job of jobs) resolveReceived(job.data);
        },
      );

      const jobId = await boss.send(queue, { documentId: "doc-e2e-123" });
      expect(jobId).toBeTruthy();

      const payload = await received;
      expect(payload).toEqual({ documentId: "doc-e2e-123" });

      // The worker resolved — pg-boss should now record the job as completed.
      await vi.waitFor(
        async () => {
          const job = await boss.getJobById(queue, jobId as string);
          expect(job?.state).toBe("completed");
        },
        { timeout: 30_000, interval: 500 },
      );

      expect(errors).toEqual([]);
    } finally {
      await boss.stop({ graceful: true, timeout: 10_000 });
    }
  });
});
