import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SKIP_MESSAGE, type Sql, applyMigrations, tryStartPostgres } from "./container";

let container: StartedPostgreSqlContainer | null = null;
let sql: Sql | null = null;

beforeAll(async () => {
  container = await tryStartPostgres();
  if (!container) return;
  sql = postgres(container.getConnectionUri(), { max: 1, onnotice: () => {} });
  await applyMigrations(sql);
}, 180_000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
}, 60_000);

describe("SQL migrations against pgvector/pgvector:pg17", () => {
  it("creates all key tables", async (ctx) => {
    if (!sql) return ctx.skip(SKIP_MESSAGE);
    const rows = await sql`
      select table_name from information_schema.tables where table_schema = 'public'
    `;
    const tables = new Set(rows.map((r) => r.table_name as string));
    for (const expected of [
      "user",
      "session",
      "account",
      "collections",
      "documents",
      "document_chunks",
      "ingestion_jobs",
      "conversations",
      "messages",
      "message_citations",
      "feedback",
      "eval_cases",
      "eval_runs",
      "eval_results",
    ]) {
      expect(tables, `missing table ${expected}`).toContain(expected);
    }
  });

  it("creates the HNSW index on embeddings and the GIN index on tsv", async (ctx) => {
    if (!sql) return ctx.skip(SKIP_MESSAGE);
    const rows = await sql`
      select indexname, indexdef from pg_indexes where tablename = 'document_chunks'
    `;
    const byName = new Map(rows.map((r) => [r.indexname as string, r.indexdef as string]));

    expect(byName.get("chunks_embedding_hnsw_idx")).toMatch(/using hnsw/i);
    expect(byName.get("chunks_embedding_hnsw_idx")).toMatch(/vector_cosine_ops/i);
    expect(byName.get("chunks_tsv_gin_idx")).toMatch(/using gin/i);
    expect(byName.has("chunks_document_chunk_uq")).toBe(true);
  });

  it("populates the tsv generated column (content + context prefix) on insert", async (ctx) => {
    if (!sql) return ctx.skip(SKIP_MESSAGE);
    const db = sql;
    const userId = `user-${randomUUID()}`;
    const collectionId = randomUUID();
    const documentId = randomUUID();
    const chunkId = randomUUID();

    await db`insert into "user" (id, name, email)
      values (${userId}, 'Migration Tester', ${`${userId}@example.com`})`;
    await db`insert into collections (id, name, created_by)
      values (${collectionId}, 'Migration Fixtures', ${userId})`;
    await db`insert into documents (id, collection_id, source_type, title, content_hash, status, created_by)
      values (${documentId}, ${collectionId}, 'upload', 'Migration Doc', ${randomUUID()}, 'ready', ${userId})`;
    await db`insert into document_chunks
        (id, document_id, collection_id, chunk_index, content, context_prefix, token_count)
      values
        (${chunkId}, ${documentId}, ${collectionId}, 0,
         'Rollbacks are available for thirty minutes after deploy.',
         'From the Acme deploy guide, rollback policy section.', 12)`;

    const [row] = await db`
      select tsv is not null as has_tsv,
             tsv @@ to_tsquery('english', 'rollback') as matches_content,
             tsv @@ to_tsquery('english', 'policy') as matches_prefix
      from document_chunks where id = ${chunkId}
    `;
    expect(row.has_tsv).toBe(true);
    expect(row.matches_content).toBe(true);
    // The context prefix is indexed alongside the content.
    expect(row.matches_prefix).toBe(true);
  });
});
