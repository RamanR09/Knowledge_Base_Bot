import { z } from "zod";

/**
 * Server-side environment validation. Imported by anything touching secrets.
 * Fails fast at boot with a readable message instead of at first use.
 * NEVER add NEXT_PUBLIC_ keys for provider secrets.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET is required (openssl rand -base64 32)"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ALLOWED_DOMAIN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  FIRECRAWL_API_KEY: z.string().optional(),

  UPLOAD_DIR: z.string().default("./data/uploads"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

/** Throw a clear error when a feature needs a provider key that isn't set. */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `${String(key)} is not configured. Add it to your .env file (see .env.example).`,
    );
  }
  return value as NonNullable<(typeof env)[K]>;
}
