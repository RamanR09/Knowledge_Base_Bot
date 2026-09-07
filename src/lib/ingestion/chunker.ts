import type { Chunk, ParsedBlock, ParsedDocument } from "./types";

/**
 * Heading-aware chunker. Pure and deterministic — unit-testable without any
 * providers. Strategy:
 *  - Walk blocks maintaining a heading-path stack (h1 → h2 → ...).
 *  - h1/h2 headings start a new section; content is NEVER merged across them.
 *  - Within a section, blocks are packed into chunks targeting
 *    ~TARGET_CHUNK_TOKENS with a hard cap of MAX_CHUNK_TOKENS.
 *  - When a section spills over into multiple chunks, consecutive chunks
 *    overlap by ~15% (whole trailing sentences, never mid-word).
 */

export const TARGET_CHUNK_TOKENS = 600;
export const MAX_CHUNK_TOKENS = 1000;
const OVERLAP_RATIO = 0.15;

/** Cheap token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface SectionBlock {
  text: string;
  page?: number;
  headingPath: string[];
}

interface Segment extends SectionBlock {
  tokens: number;
  /** True for the synthetic overlap carry-over seeded from the previous chunk. */
  overlap?: boolean;
}

function renderBlock(block: ParsedBlock): string {
  if (block.type === "heading") {
    const level = Math.min(Math.max(block.headingLevel ?? 1, 1), 6);
    return `${"#".repeat(level)} ${block.text.trim()}`;
  }
  return block.text;
}

/**
 * Split text into sentence-ish segments (sentence enders, or line breaks),
 * keeping delimiters attached so joining segments reproduces the text.
 */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?\n]*[.!?]+["')\]]*\s*|[^.!?\n]*\n+|[^.!?\n]+$/g);
  const segments = (parts ?? [text]).filter((p) => p.trim().length > 0);
  return segments.length > 0 ? segments : [text];
}

/** Split a single monster sentence on whitespace (never mid-word). */
function splitByWords(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const pieces: string[] = [];
  let current: string[] = [];
  let currentChars = 0;
  const maxChars = maxTokens * 4;
  for (const word of words) {
    if (current.length > 0 && currentChars + word.length + 1 > maxChars) {
      pieces.push(current.join(" "));
      current = [];
      currentChars = 0;
    }
    current.push(word);
    currentChars += word.length + 1;
  }
  if (current.length > 0) pieces.push(current.join(" "));
  return pieces.length > 0 ? pieces : [text];
}

/** Split an oversized block into target-sized pieces along sentence boundaries. */
function splitOversizedText(text: string): string[] {
  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) pieces.push(trimmed);
    current = "";
  };
  for (const sentence of splitSentences(text)) {
    const parts =
      estimateTokens(sentence) > TARGET_CHUNK_TOKENS
        ? splitByWords(sentence, TARGET_CHUNK_TOKENS)
        : [sentence];
    for (const part of parts) {
      if (current && estimateTokens(current) + estimateTokens(part) > TARGET_CHUNK_TOKENS) {
        flush();
      }
      current += current && !current.endsWith("\n") && !part.startsWith(" ") ? ` ${part}` : part;
    }
  }
  flush();
  return pieces.length > 0 ? pieces : [text.trim()];
}

/** Trailing whole sentences of `text` totalling at most `budgetTokens`. */
function trailingSentences(text: string, budgetTokens: number): string {
  if (budgetTokens <= 0) return "";
  const sentences = splitSentences(text);
  const taken: string[] = [];
  let tokens = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const t = estimateTokens(sentences[i]);
    if (tokens + t > budgetTokens) break;
    taken.unshift(sentences[i]);
    tokens += t;
  }
  return taken.join("").trim();
}

function packSection(section: SectionBlock[], chunks: Chunk[]): void {
  // Expand blocks into segments no larger than the hard cap.
  const segments: Segment[] = [];
  for (const block of section) {
    const tokens = estimateTokens(block.text);
    if (tokens <= MAX_CHUNK_TOKENS) {
      segments.push({ ...block, tokens });
    } else {
      for (const piece of splitOversizedText(block.text)) {
        segments.push({
          text: piece,
          tokens: estimateTokens(piece),
          page: block.page,
          headingPath: block.headingPath,
        });
      }
    }
  }

  let acc: Segment[] = [];
  let accTokens = 0;

  const flush = (seedOverlap: boolean) => {
    const real = acc.filter((s) => !s.overlap);
    if (real.length === 0) {
      acc = [];
      accTokens = 0;
      return;
    }
    const content = acc.map((s) => s.text).join("\n\n").trim();
    const pages = acc
      .map((s) => s.page)
      .filter((p): p is number => p !== undefined);
    const chunk: Chunk = {
      content,
      headingPath: real[0].headingPath,
      pageStart: pages.length > 0 ? Math.min(...pages) : undefined,
      pageEnd: pages.length > 0 ? Math.max(...pages) : undefined,
      tokenCount: estimateTokens(content),
      chunkIndex: chunks.length,
    };
    chunks.push(chunk);
    acc = [];
    accTokens = 0;
    if (seedOverlap) {
      const overlapText = trailingSentences(
        content,
        Math.floor(chunk.tokenCount * OVERLAP_RATIO),
      );
      if (overlapText) {
        const seg: Segment = {
          text: overlapText,
          tokens: estimateTokens(overlapText),
          page: pages.length > 0 ? Math.max(...pages) : undefined,
          headingPath: real[0].headingPath,
          overlap: true,
        };
        acc = [seg];
        accTokens = seg.tokens;
      }
    }
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (accTokens + seg.tokens > MAX_CHUNK_TOKENS) {
      if (acc.some((s) => !s.overlap)) {
        flush(true);
      }
      // If only the overlap carry-over remains and it would still blow the
      // hard cap, drop it — the cap wins over the overlap.
      if (acc.length > 0 && accTokens + seg.tokens > MAX_CHUNK_TOKENS) {
        acc = [];
        accTokens = 0;
      }
    }
    acc.push(seg);
    accTokens += seg.tokens;
    if (accTokens >= TARGET_CHUNK_TOKENS && i < segments.length - 1) {
      flush(true);
    }
  }
  flush(false);
}

export function chunkDocument(doc: ParsedDocument): Chunk[] {
  // 1. Group blocks into sections, splitting at every h1/h2 heading and
  //    tracking the heading path in effect for each block.
  const sections: SectionBlock[][] = [];
  let current: SectionBlock[] = [];
  const pathStack: { level: number; text: string }[] = [];

  for (const block of doc.blocks) {
    if (block.type === "heading") {
      const level = Math.min(Math.max(block.headingLevel ?? 1, 1), 6);
      if (level <= 2 && current.length > 0) {
        sections.push(current);
        current = [];
      }
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].level >= level) {
        pathStack.pop();
      }
      const headingText = block.text.trim();
      if (headingText) pathStack.push({ level, text: headingText });
    }
    const text = renderBlock(block).trim();
    if (!text) continue;
    current.push({
      text,
      page: block.page,
      headingPath: pathStack.map((p) => p.text),
    });
  }
  if (current.length > 0) sections.push(current);

  // 2. Pack each section independently — never merging across sections.
  const chunks: Chunk[] = [];
  for (const section of sections) packSection(section, chunks);
  return chunks;
}
