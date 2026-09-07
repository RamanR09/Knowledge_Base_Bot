import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://kbchat:kbchat_dev_password@localhost:5432/kbchat",
  },
  strict: true,
  verbose: true,
});
