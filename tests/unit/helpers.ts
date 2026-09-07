/**
 * Typed fixture builders for retrieval/rerank chunk objects used across the
 * unit suite. Each call yields unique ids unless overridden, so tests can
 * assert identity mapping without accidental collisions.
 */
import type { RankedChunk } from "@/lib/rag/rerankChunks";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

let counter = 0;

export function makeRetrievedChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  counter += 1;
  return {
    chunkId: `chunk-${counter}`,
    documentId: `doc-${counter}`,
    documentTitle: `Document ${counter}`,
    headingPath: ["Section"],
    pageStart: null,
    pageEnd: null,
    chunkIndex: 0,
    content: `Fixture content for chunk ${counter}.`,
    contextPrefix: null,
    rrfScore: 0.03,
    ...overrides,
  };
}

export function makeRankedChunk(overrides: Partial<RankedChunk> = {}): RankedChunk {
  return {
    ...makeRetrievedChunk(),
    relevanceScore: 0.9,
    ...overrides,
  };
}

/** A string of exactly `chars` characters (≈ chars/4 estimated tokens). */
export function textOfLength(chars: number): string {
  return "x".repeat(chars);
}
