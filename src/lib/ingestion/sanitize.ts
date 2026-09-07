/**
 * Text hygiene for ingested content. Every chunk passes through here before it
 * is stored: invisible/bidi control characters are stripped (they enable
 * hidden-text prompt injection and copy-paste spoofing), and obvious
 * instruction-override phrasings are flagged so ingestion can mark the chunk
 * `suspectedInjection` (the chunk is still ingested — flagged, not dropped).
 */

/** Zero-width chars (U+200B-200F), bidi controls (U+202A-202E), bidi isolates (U+2066-2069), BOM (U+FEFF). */
const INVISIBLE_CHARS_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

export function sanitizeText(s: string): string {
  return s.replace(INVISIBLE_CHARS_RE, "");
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /disregard\s+(?:all\s+)?(?:your|the|previous|prior)\s+(?:rules|instructions)/i,
  /\byou\s+are\s+now\b/i,
  /reveal\s+.*(?:system\s+prompt|instructions)/i,
  /print\s+your\s+(?:system\s+)?prompt/i,
  /forget\s+(?:all\s+)?(?:your|previous|prior)\s+(?:rules|instructions)/i,
  /\bnew\s+system\s+prompt\b/i,
];

/** True when the text contains a phrase that looks like a prompt-injection attempt. */
export function detectInjectionPatterns(s: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(s));
}
