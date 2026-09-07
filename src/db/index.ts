import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Single shared Drizzle client. postgres.js pools internally.
 * In dev, preserve the client across HMR reloads.
 */
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.pgClient ??
  postgres(env.DATABASE_URL, {
    max: 10,
    onnotice: () => {}, // silence NOTICE spam from migrations/extensions
  });

if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
