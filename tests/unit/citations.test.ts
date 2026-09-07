import { describe, expect, it } from "vitest";
import { mapCitations, type CitationEvent } from "@/lib/rag/citations";
import { makeRankedChunk } from "./helpers";

describe("mapCitations", () => {
  const chunkA = makeRankedChunk({
    chunkId: "chunk-a",
    documentId: "doc-1",
    pageStart: 3,
    pageEnd: 5,
  });
  const chunkB = makeRankedChunk({
    chunkId: "chunk-b",
    documentId: "doc-2",
    pageStart: null,
    pageEnd: null,
  });
  const chunks = [chunkA, chunkB];

  it("maps documentIndex to the chunk at that position in the request order", () => {
    const events: CitationEvent[] = [
      { documentIndex: 1, citedText: "from B" },
      { documentIndex: 0, citedText: "from A" },
    ];
    const records = mapCitations(events, chunks);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ chunkId: "chunk-b", documentId: "doc-2", citedText: "from B" });
    expect(records[1]).toMatchObject({ chunkId: "chunk-a", documentId: "doc-1", citedText: "from A" });
  });

  it("assigns stable 1-based ordinals by first appearance", () => {
    const events: CitationEvent[] = [
      { documentIndex: 0, citedText: "alpha" },
      { documentIndex: 1, citedText: "beta" },
      { documentIndex: 0, citedText: "alpha" }, // repeat of the first citation
      { documentIndex: 0, citedText: "gamma" },
    ];
    const records = mapCitations(events, chunks);
    expect(records.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(records[0]).toMatchObject({ chunkId: "chunk-a", citedText: "alpha", ordinal: 1 });
    expect(records[1]).toMatchObject({ chunkId: "chunk-b", citedText: "beta", ordinal: 2 });
    expect(records[2]).toMatchObject({ chunkId: "chunk-a", citedText: "gamma", ordinal: 3 });
  });

  it("dedupes by (chunkId, citedText), not by chunk or text alone", () => {
    const events: CitationEvent[] = [
      { documentIndex: 0, citedText: "same text" },
      { documentIndex: 0, citedText: "same text" }, // exact duplicate → dropped
      { documentIndex: 1, citedText: "same text" }, // same text, other chunk → kept
      { documentIndex: 0, citedText: "other text" }, // same chunk, other text → kept
    ];
    const records = mapCitations(events, chunks);
    expect(records).toHaveLength(3);
    expect(records.map((r) => [r.chunkId, r.citedText])).toEqual([
      ["chunk-a", "same text"],
      ["chunk-b", "same text"],
      ["chunk-a", "other text"],
    ]);
  });

  it("safely skips out-of-range documentIndex values and keeps ordinals contiguous", () => {
    const events: CitationEvent[] = [
      { documentIndex: 0, citedText: "valid" },
      { documentIndex: 99, citedText: "beyond the list" },
      { documentIndex: -1, citedText: "negative" },
      { documentIndex: 1, citedText: "also valid" },
    ];
    const records = mapCitations(events, chunks);
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.ordinal)).toEqual([1, 2]);
    expect(records.map((r) => r.chunkId)).toEqual(["chunk-a", "chunk-b"]);
  });

  it("passes chunk page range through as startPage/endPage (null preserved)", () => {
    const records = mapCitations(
      [
        { documentIndex: 0, citedText: "paged" },
        { documentIndex: 1, citedText: "unpaged" },
      ],
      chunks,
    );
    expect(records[0]).toMatchObject({ startPage: 3, endPage: 5 });
    expect(records[1]).toMatchObject({ startPage: null, endPage: null });
  });

  it("returns an empty list for no events", () => {
    expect(mapCitations([], chunks)).toEqual([]);
  });
});
