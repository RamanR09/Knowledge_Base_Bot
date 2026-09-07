/**
 * Normalized intermediate representation shared by all parsers, the chunker,
 * and the ingestion worker. Parsers turn any source format into a
 * `ParsedDocument`; the chunker turns that into `Chunk`s ready for
 * contextualization + embedding.
 */

export interface ParsedBlock {
  type: "heading" | "paragraph" | "code" | "table" | "list";
  text: string;
  /** Only set for `heading` blocks (1-6). */
  headingLevel?: number;
  /** 1-based page number for paginated sources (PDF). */
  page?: number;
}

export interface ParsedDocument {
  title: string;
  blocks: ParsedBlock[];
  pageCount?: number;
}

export interface Chunk {
  content: string;
  /** Heading breadcrumb (h1 → h2 → ...) in effect where the chunk starts. */
  headingPath: string[];
  pageStart?: number;
  pageEnd?: number;
  /** Estimated tokens (chars / 4, ceil). */
  tokenCount: number;
  /** 0-based position within the document. */
  chunkIndex: number;
}
