import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

/** Model registry — the ONLY place model IDs may appear. */
export const MODELS = {
  /** Main answer generation: strongest long-context multi-document synthesis. */
  generation: "claude-opus-5",
  /** Cheap/fast tasks: query planning, contextual chunk prefixes, guardrail classification. */
  fast: "claude-haiku-4-5",
} as const;

let client: Anthropic | undefined;

/** Lazy singleton so the app can boot without a key until an AI feature is used. */
export function anthropic(): Anthropic {
  if (!client) {
    // Prefer an explicit key; otherwise the zero-arg SDK constructor resolves
    // credentials itself (ANTHROPIC_AUTH_TOKEN, or the machine's `ant auth
    // login` profile) — convenient for local dev. Requests fail with a clear
    // SDK auth error when no credential source exists at all.
    client =
      env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY !== ""
        ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
        : new Anthropic();
  }
  return client;
}
