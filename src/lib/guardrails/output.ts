import { containsSecretLeak } from "@/lib/guardrails/patterns";

export interface OutputVerdict {
  secretLeak: boolean;
  uncited: boolean;
}

/** A substantive answer shorter than this may reasonably omit citations. */
const UNCITED_MIN_CHARS = 400;

/** Honest "not found" phrasings that legitimately carry no citations. */
const NOT_FOUND_PHRASES = [
  "couldn't find",
  "could not find",
  "not in the knowledge base",
  "isn't in the knowledge base",
  "no relevant information",
  "don't have information",
  "do not have information",
];

/**
 * Output gate: deterministic and synchronous. Flags secret-looking strings
 * and long substantive answers that cite nothing (a hallucination signal).
 */
export function checkOutput(answer: string, citationCount: number): OutputVerdict {
  // Normalize curly apostrophes so "couldn’t find" matches "couldn't find".
  const lower = answer.toLowerCase().replace(/[‘’]/g, "'");
  const saysNotFound = NOT_FOUND_PHRASES.some((phrase) => lower.includes(phrase));
  return {
    secretLeak: containsSecretLeak(answer),
    uncited: answer.length > UNCITED_MIN_CHARS && citationCount === 0 && !saysNotFound,
  };
}
