import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_TOKENS,
  TARGET_CHUNK_TOKENS,
  chunkDocument,
} from "@/lib/ingestion/chunker";
import type { ParsedBlock, ParsedDocument } from "@/lib/ingestion/types";

function heading(text: string, level: number, page?: number): ParsedBlock {
  return { type: "heading", text, headingLevel: level, page };
}

function para(text: string, page?: number): ParsedBlock {
  return { type: "paragraph", text, page };
}

function doc(blocks: ParsedBlock[]): ParsedDocument {
  return { title: "Fixture Document", blocks };
}

let sentenceCounter = 0;

/** `count` distinct ~19-token sentences, so overlap between chunks is detectable. */
function sentences(count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    sentenceCounter += 1;
    parts.push(`Sentence number ${sentenceCounter} keeps the chunker fixture content varied. `);
  }
  return parts.join("").trim();
}

/**
 * Length (in chars) of the longest prefix of `next` that is also a suffix of
 * `prev` (ignoring trailing whitespace on the prev side). Zero means the two
 * chunks share no leading/trailing text.
 */
function overlapLength(prev: string, next: string): number {
  const p = prev.trimEnd();
  const max = Math.min(p.length, next.length);
  for (let k = max; k > 0; k -= 1) {
    if (p.endsWith(next.slice(0, k))) return k;
  }
  return 0;
}

describe("chunkDocument — heading structure", () => {
  it("maintains the h1>h2>h3 heading-path stack and pops siblings correctly", () => {
    const chunks = chunkDocument(
      doc([
        heading("Alpha", 1),
        para("Intro paragraph under the h1."),
        heading("Beta", 2),
        para("Content under Beta."),
        heading("Gamma", 3),
        para("Content under Gamma, nested three levels deep."),
        heading("Delta", 2),
        para("Content under Delta, a sibling of Beta."),
      ]),
    );

    expect(chunks).toHaveLength(3);
    expect(chunks[0].headingPath).toEqual(["Alpha"]);
    expect(chunks[1].headingPath).toEqual(["Alpha", "Beta"]);
    // Delta replaces Beta (and drops Gamma) on the stack.
    expect(chunks[2].headingPath).toEqual(["Alpha", "Delta"]);

    // h3 does NOT start a new section: Gamma's content lives in Beta's chunk.
    expect(chunks[1].content).toContain("### Gamma");
    expect(chunks[1].content).toContain("nested three levels deep");
  });

  it("never merges content across an h1/h2 boundary, even when both sections are tiny", () => {
    const chunks = chunkDocument(
      doc([
        heading("First Section", 1),
        para("Tiny first body."),
        heading("Second Section", 2),
        para("Tiny second body."),
      ]),
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain("# First Section");
    expect(chunks[0].content).not.toContain("Second Section");
    expect(chunks[1].content).toContain("## Second Section");
    expect(chunks[1].content).not.toContain("Tiny first body");
    // No cross-boundary overlap either.
    expect(overlapLength(chunks[0].content, chunks[1].content)).toBe(0);
  });
});

describe("chunkDocument — size budget", () => {
  it("respects the ~600 target and 1000 hard max when packing many paragraphs", () => {
    const blocks: ParsedBlock[] = [heading("Big Section", 1)];
    for (let i = 0; i < 30; i += 1) blocks.push(para(sentences(4)));

    const chunks = chunkDocument(doc(blocks));

    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
    // Every chunk except the final remainder lands around the target.
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.tokenCount).toBeGreaterThanOrEqual(TARGET_CHUNK_TOKENS);
      expect(chunk.tokenCount).toBeLessThanOrEqual(TARGET_CHUNK_TOKENS + 250);
    }
  });

  it("splits a single oversized block without ever exceeding the hard cap", () => {
    const chunks = chunkDocument(
      doc([heading("Monster", 1), para(sentences(200))]),
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
      expect(chunk.headingPath).toEqual(["Monster"]);
    }
  });
});

describe("chunkDocument — overlap within a split section", () => {
  it("carries trailing sentences of each chunk into the next chunk of the same section", () => {
    const blocks: ParsedBlock[] = [heading("Overlapping Section", 1)];
    for (let i = 0; i < 24; i += 1) blocks.push(para(sentences(4)));

    const chunks = chunkDocument(doc(blocks));
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < chunks.length - 1; i += 1) {
      const shared = overlapLength(chunks[i].content, chunks[i + 1].content);
      // At least one full sentence (~75 chars) is carried over.
      expect(shared).toBeGreaterThanOrEqual(40);
      // The overlap never pushes a chunk past the hard cap.
      expect(chunks[i + 1].tokenCount).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
  });
});

describe("chunkDocument — metadata", () => {
  it("carries min/max page numbers into pageStart/pageEnd", () => {
    const chunks = chunkDocument(
      doc([
        heading("Paged Section", 1, 2),
        para("Content on page two.", 2),
        para("Content that continues onto page three.", 3),
      ]),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(2);
    expect(chunks[0].pageEnd).toBe(3);
  });

  it("leaves pages undefined for unpaginated sources", () => {
    const chunks = chunkDocument(doc([heading("No Pages", 1), para("Body text.")]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBeUndefined();
    expect(chunks[0].pageEnd).toBeUndefined();
  });

  it("assigns sequential chunkIndex values across all sections", () => {
    const blocks: ParsedBlock[] = [];
    for (let s = 0; s < 3; s += 1) {
      blocks.push(heading(`Section ${s}`, 2));
      for (let i = 0; i < 8; i += 1) blocks.push(para(sentences(4)));
    }

    const chunks = chunkDocument(doc(blocks));
    // One chunk per h2 section when each section fits the token target.
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });
});

describe("chunkDocument — empty input", () => {
  it("returns [] for a document with no blocks", () => {
    expect(chunkDocument(doc([]))).toEqual([]);
  });

  it("returns [] for a document with only whitespace content", () => {
    expect(chunkDocument(doc([para("   \n\t  ")]))).toEqual([]);
  });
});
