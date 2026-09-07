/**
 * Exercises the REAL `hybridSearch` / `retrieveForQuestion` code paths (the
 * CTE SQL in src/lib/rag/retrieve.ts) against a pgvector container. The only
 * mock is the Voyage client boundary: `embedQuery` returns deterministic
 * basis-ish 1024-dim vectors per query text, so vector ranking is exact.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SKIP_MESSAGE, type Sql, applyMigrations, tryStartPostgres } from "./container";

const h = vi.hoisted(() => {
  const basisVector = (hot: number): number[] => {
    const v = new Array<number>(1024).fill(0);
    v[hot] = 1;
    return v;
  };
  /** Per-test mapping of query text → deterministic query embedding. */
  const queryVectors = new Map<string, number[]>();
  return { basisVector, queryVectors };
});

vi.mock("@/lib/llm/voyage", () => ({
  EMBEDDING_MODEL: "voyage-3-large",
  EMBEDDING_DIMENSIONS: 1024,
  RERANK_MODEL: "rerank-2.5",
  EMBED_BATCH_SIZE: 128,
  embedQuery: vi.fn(async (text: string) => h.queryVectors.get(text) ?? h.basisVector(1023)),
  embedDocuments: vi.fn(async (texts: string[]) => texts.map(() => h.basisVector(1023))),
  rerank: vi.fn(async () => []),
}));

const RRF_K = 60; // must match retrieve.ts

interface SeededChunk {
  id: string;
  documentId: string;
  collectionId: string;
  chunkIndex: number;
  content: string;
  hot: number;
}

let container: StartedPostgreSqlContainer | null = null;
let sql: Sql | null = null;
let retrieve: typeof import("@/lib/rag/retrieve") | null = null;

const ids = {
  user: `user-${randomUUID()}`,
  collectionA: randomUUID(),
  collectionB: randomUUID(),
  docDeploy: randomUUID(),
  docHandbook: randomUUID(),
  docRunbook: randomUUID(),
};

const chunkRollback: SeededChunk = {
  id: randomUUID(),
  documentId: ids.docDeploy,
  collectionId: ids.collectionA,
  chunkIndex: 1,
  content: "Rollbacks stay available for thirty minutes after a production release completes.",
  hot: 1,
};
const chunkAutoscale: SeededChunk = {
  id: randomUUID(),
  documentId: ids.docHandbook,
  collectionId: ids.collectionA,
  chunkIndex: 1,
  content: "Kubernetes clusters autoscale between three and twelve nodes.",
  hot: 5,
};
const chunkUpgrade: SeededChunk = {
  id: randomUUID(),
  documentId: ids.docRunbook,
  collectionId: ids.collectionB,
  chunkIndex: 0,
  content: "Kubernetes cluster upgrades require a scheduled maintenance window.",
  hot: 8,
};

const allChunks: SeededChunk[] = [
  {
    id: randomUUID(),
    documentId: ids.docDeploy,
    collectionId: ids.collectionA,
    chunkIndex: 0,
    content: "The deploy pipeline promotes releases through staging before production.",
    hot: 0,
  },
  chunkRollback,
  {
    id: randomUUID(),
    documentId: ids.docDeploy,
    collectionId: ids.collectionA,
    chunkIndex: 2,
    content: "Error budgets are examined at the weekly reliability sync.",
    hot: 2,
  },
  {
    id: randomUUID(),
    documentId: ids.docDeploy,
    collectionId: ids.collectionA,
    chunkIndex: 3,
    content: "Feature flags gate risky changes during gradual rollouts.",
    hot: 3,
  },
  {
    id: randomUUID(),
    documentId: ids.docHandbook,
    collectionId: ids.collectionA,
    chunkIndex: 0,
    content: "Incident commanders rotate across the platform group every sprint.",
    hot: 4,
  },
  chunkAutoscale,
  {
    id: randomUUID(),
    documentId: ids.docHandbook,
    collectionId: ids.collectionA,
    chunkIndex: 2,
    content: "Billing invoices are generated on the first day of each month.",
    hot: 6,
  },
  {
    id: randomUUID(),
    documentId: ids.docHandbook,
    collectionId: ids.collectionA,
    chunkIndex: 3,
    content: "The onboarding checklist covers laptop setup and access requests.",
    hot: 7,
  },
  chunkUpgrade,
];

async function seed(db: Sql): Promise<void> {
  await db`insert into "user" (id, name, email)
    values (${ids.user}, 'Hybrid Tester', ${`${ids.user}@example.com`})`;
  await db`insert into collections (id, name, created_by)
    values (${ids.collectionA}, 'Ops Docs', ${ids.user}),
           (${ids.collectionB}, 'Security Docs', ${ids.user})`;
  await db`insert into documents (id, collection_id, source_type, title, content_hash, status, created_by)
    values (${ids.docDeploy}, ${ids.collectionA}, 'upload', 'Acme Deploy Guide', ${randomUUID()}, 'ready', ${ids.user}),
           (${ids.docHandbook}, ${ids.collectionA}, 'upload', 'Acme Platform Handbook', ${randomUUID()}, 'ready', ${ids.user}),
           (${ids.docRunbook}, ${ids.collectionB}, 'upload', 'Acme Security Runbook', ${randomUUID()}, 'ready', ${ids.user})`;

  for (const chunk of allChunks) {
    const isRollback = chunk.id === chunkRollback.id;
    await db`insert into document_chunks
        (id, document_id, collection_id, chunk_index, content, context_prefix,
         heading_path, page_start, page_end, token_count, embedding)
      values
        (${chunk.id}, ${chunk.documentId}, ${chunk.collectionId}, ${chunk.chunkIndex},
         ${chunk.content}, ${isRollback ? "From the deploy guide, rollback section." : null},
         ${isRollback ? db.array(["Deploy Guide", "Rollbacks"]) : db.array([])},
         ${isRollback ? 3 : null}, ${isRollback ? 4 : null},
         ${Math.ceil(chunk.content.length / 4)},
         ${JSON.stringify(h.basisVector(chunk.hot))}::vector)`;
  }
}

beforeAll(async () => {
  container = await tryStartPostgres();
  if (!container) return;
  const uri = container.getConnectionUri();
  // retrieve.ts reaches the app db via env DATABASE_URL — point it at the
  // container BEFORE the dynamic import below triggers env validation.
  process.env.DATABASE_URL = uri;
  sql = postgres(uri, { max: 1, onnotice: () => {} });
  await applyMigrations(sql);
  await seed(sql);
  retrieve = await import("@/lib/rag/retrieve");
}, 180_000);

afterAll(async () => {
  // Close the app's shared postgres.js pool (created by src/db on import).
  const g = globalThis as { pgClient?: { end: () => Promise<void> } };
  await g.pgClient?.end();
  await sql?.end();
  await container?.stop();
}, 60_000);

describe("hybridSearch (real CTE SQL against pgvector)", () => {
  it("ranks the vector-similar chunk first when the text arm has no matches", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const query = "unrelated telemetry snapshot";
    h.queryVectors.set(query, h.basisVector(chunkRollback.hot));

    const results = await retrieve.hybridSearch(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe(chunkRollback.id);
    // Vector arm rank 1 only: score = 1/(k+1).
    expect(results[0].rrfScore).toBeCloseTo(1 / (RRF_K + 1), 6);
  });

  it("round-trips chunk metadata (heading path, pages, context prefix)", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const query = "unrelated telemetry snapshot";
    h.queryVectors.set(query, h.basisVector(chunkRollback.hot));

    const [top] = await retrieve.hybridSearch(query);
    expect(top).toMatchObject({
      chunkId: chunkRollback.id,
      documentId: ids.docDeploy,
      documentTitle: "Acme Deploy Guide",
      headingPath: ["Deploy Guide", "Rollbacks"],
      pageStart: 3,
      pageEnd: 4,
      chunkIndex: 1,
      content: chunkRollback.content,
      contextPrefix: "From the deploy guide, rollback section.",
    });
  });

  it("surfaces a keyword-only match through the tsv leg", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const query = "kubernetes autoscale nodes";
    // Query vector points at no seeded chunk → the vector arm gives no chunk
    // an advantage; only the full-text leg can single one out.
    h.queryVectors.set(query, h.basisVector(900));

    const results = await retrieve.hybridSearch(query);
    expect(results[0].chunkId).toBe(chunkAutoscale.id);
    // Score strictly above a best-possible single-arm score proves RRF fused
    // the text-leg rank with a vector-leg rank.
    expect(results[0].rrfScore).toBeGreaterThan(1 / (RRF_K + 1) + 1e-9);
  });

  it("fuses both arms with RRF: a dual-arm hit outranks single-arm hits", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const query = "kubernetes autoscale nodes";
    h.queryVectors.set(query, h.basisVector(chunkAutoscale.hot));

    const results = await retrieve.hybridSearch(query);
    expect(results[0].chunkId).toBe(chunkAutoscale.id);
    // Rank 1 in the vector arm AND rank 1 in the text arm.
    expect(results[0].rrfScore).toBeCloseTo(2 / (RRF_K + 1), 6);
    expect(results[0].rrfScore).toBeGreaterThan(results[1].rrfScore);
  });

  it("applies the collection filter to both arms", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const query = "kubernetes cluster";
    h.queryVectors.set(query, h.basisVector(chunkAutoscale.hot));

    const unfiltered = await retrieve.hybridSearch(query);
    expect(unfiltered.map((r) => r.chunkId)).toContain(chunkAutoscale.id);
    expect(unfiltered.map((r) => r.chunkId)).toContain(chunkUpgrade.id);

    const filtered = await retrieve.hybridSearch(query, { collectionId: ids.collectionB });
    expect(filtered.length).toBeGreaterThan(0);
    for (const row of filtered) {
      expect(row.documentId).toBe(ids.docRunbook);
    }
    expect(filtered.map((r) => r.chunkId)).toContain(chunkUpgrade.id);
    expect(filtered.map((r) => r.chunkId)).not.toContain(chunkAutoscale.id);
  });
});

describe("retrieveForQuestion (multi-sub-query merge)", () => {
  it("dedupes overlapping pools, keeps the best score per chunk, and caps the pool", async (ctx) => {
    if (!retrieve) return ctx.skip(SKIP_MESSAGE);
    const q1 = "unrelated telemetry snapshot";
    const q2 = "kubernetes autoscale nodes";
    h.queryVectors.set(q1, h.basisVector(chunkRollback.hot));
    h.queryVectors.set(q2, h.basisVector(chunkAutoscale.hot));

    const pool = await retrieve.retrieveForQuestion([q1, q2]);

    // Both sub-queries return (mostly) the same 9 seeded chunks — the merged
    // pool must contain each chunk exactly once.
    const chunkIds = pool.map((c) => c.chunkId);
    expect(new Set(chunkIds).size).toBe(chunkIds.length);
    expect(pool.length).toBeLessThanOrEqual(60);
    expect(pool.length).toBeLessThanOrEqual(allChunks.length);

    // Sorted by fused score, descending.
    for (let i = 1; i < pool.length; i += 1) {
      expect(pool[i - 1].rrfScore).toBeGreaterThanOrEqual(pool[i].rrfScore);
    }

    // The autoscale chunk was a dual-arm rank-1 hit for q2 — the merge must
    // keep that best score, not the weaker one from q1's pool.
    const autoscale = pool.find((c) => c.chunkId === chunkAutoscale.id);
    expect(autoscale).toBeDefined();
    expect(autoscale?.rrfScore).toBeCloseTo(2 / (RRF_K + 1), 6);
    expect(pool[0].chunkId).toBe(chunkAutoscale.id);
  });
});
