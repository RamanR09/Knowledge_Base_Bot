import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    // src/lib/env.ts zod-validates process.env at import time. Unit tests are
    // fully offline and never open a connection or call a provider, but they
    // do import modules whose import chain reaches env.ts — give it harmless
    // placeholder values so imports don't throw. (Integration tests overwrite
    // DATABASE_URL with the testcontainer URI before importing app modules.)
    env: {
      DATABASE_URL: "postgres://offline-unit-tests/none",
      BETTER_AUTH_SECRET: "offline-unit-tests-placeholder-secret",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        // `npm run test` stays unit-only (`vitest run tests/unit`); this
        // project only picks up files for `vitest run tests/integration`.
        // Containers are slow to pull/boot, hence the generous timeouts, and
        // files run serially so at most one Postgres container exists at a time.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
