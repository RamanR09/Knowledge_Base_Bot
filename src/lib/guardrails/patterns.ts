/**
 * Shared deterministic guardrail patterns: prompt-injection heuristics for the
 * input gate and secret-leak signatures for the output gate.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|rules|prompts?)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions|rules|prompts?)/i,
  /forget\s+(?:all\s+|any\s+)?(?:previous|prior|your)\s+(?:instructions|rules|prompts?)/i,
  /(?:reveal|show|print|output|repeat|leak)\s+(?:me\s+)?(?:your\s+)?(?:hidden\s+|full\s+)?system\s+prompt/i,
  /reveal\s+(?:your\s+)?(?:hidden\s+)?(?:instructions|prompt)/i,
  /you\s+are\s+now\s+(?:in\s+)?(?:developer|dan|jailbreak|god)\s*mode/i,
  /pretend\s+(?:you\s+are|to\s+be)\s+(?:an?\s+)?(?:unrestricted|uncensored|jailbroken)/i,
  /act\s+as\s+(?:an?\s+)?(?:unrestricted|uncensored|jailbroken)/i,
  /override\s+(?:your\s+)?(?:safety|system|previous)\s+(?:rules|instructions|guidelines|settings)/i,
  /\bdo\s+anything\s+now\b/i,
  /new\s+instructions\s*:\s*/i,
];

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{36}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /xoxb-[A-Za-z0-9-]{8,}/,
];

/** True when the text matches a known prompt-injection phrasing. */
export function matchesInjectionPattern(s: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(s));
}

/** True when the text contains a credential/secret signature. */
export function containsSecretLeak(s: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(s));
}
