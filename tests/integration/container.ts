/**
 * Shared helpers for the testcontainers-backed integration suite.
 *
 * Every integration file tries to start a `pgvector/pgvector:pg17` container
 * in its `beforeAll`; when no container runtime is available (this happens on
 * dev machines without Docker/Podman) the suite must SKIP with a clear
 * message rather than fail. Tests guard themselves with
 * `if (!ready) return ctx.skip(SKIP_MESSAGE)`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export const PG_IMAGE = "pgvector/pgvector:pg17";
export const SKIP_MESSAGE = "no container runtime available — skipped";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../src/db/migrations", import.meta.url));

/** Start a pgvector Postgres container, or return null when no runtime exists. */
export async function tryStartPostgres(): Promise<StartedPostgreSqlContainer | null> {
  try {
    return await new PostgreSqlContainer(PG_IMAGE).start();
  } catch (err) {
    const detail = err instanceof Error ? err.message.split("\n")[0] : String(err);
    console.warn(`[integration] ${SKIP_MESSAGE} (${detail})`);
    return null;
  }
}

/**
 * All statements from the generated Drizzle SQL migrations, in file order,
 * split on the drizzle-kit `--> statement-breakpoint` marker.
 */
export function migrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const statements: string[] = [];
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) statements.push(trimmed);
    }
  }
  return statements;
}

/** Apply every migration statement through a `postgres` client. */
export async function applyMigrations(sql: Sql): Promise<void> {
  for (const stmt of migrationStatements()) {
    await sql.unsafe(stmt);
  }
}
