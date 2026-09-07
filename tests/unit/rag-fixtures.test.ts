import { describe, expect, it } from "vitest";
import { fitChunksToBudget } from "@/lib/rag/generate";
import { makeRankedChunk, textOfLength } from "./helpers";

/**
 * fitChunksToBudget trims the ranked list to a ~10K-token context budget using
 * a ~4-chars-per-token estimate. 4000-char content ≈ 1000 estimated tokens.
 */
describe("fitChunksToBudget", () => {
  it("returns an empty list for empty input", () => {
    expect(fitChunksToBudget([])).toEqual([]);
  });

  it("keeps all chunks (in order) when the budget is not exceeded", () => {
    const chunks = [
      makeRankedChunk({ chunkId: "a", content: textOfLength(4000) }),
      makeRankedChunk({ chunkId: "b", content: textOfLength(4000) }),
      makeRankedChunk({ chunkId: "c", content: textOfLength(4000) }),
    ];
    const kept = fitChunksToBudget(chunks);
    expect(kept.map((c) => c.chunkId)).toEqual(["a", "b", "c"]);
  });

  it("trims from the tail once the ~10K estimated-token cap is reached, preserving order", () => {
    // 12 chunks of ~1000 estimated tokens each → only the first 10 fit the 10K budget.
    const chunks = Array.from({ length: 12 }, (_, i) =>
      makeRankedChunk({ chunkId: `chunk-${i}`, content: textOfLength(4000) }),
    );
    const kept = fitChunksToBudget(chunks);
    expect(kept).toHaveLength(10);
    expect(kept.map((c) => c.chunkId)).toEqual(chunks.slice(0, 10).map((c) => c.chunkId));
  });

  it("always keeps the first chunk even when it alone exceeds the budget", () => {
    const huge = makeRankedChunk({ chunkId: "huge", content: textOfLength(48_000) }); // ~12K tokens
    const small = makeRankedChunk({ chunkId: "small", content: textOfLength(40) });
    const kept = fitChunksToBudget([huge, small]);
    expect(kept.map((c) => c.chunkId)).toEqual(["huge"]);
  });

  it("stops adding chunks after exactly filling the budget", () => {
    const chunks = [
      makeRankedChunk({ chunkId: "big", content: textOfLength(39_996) }), // 9999 tokens
      makeRankedChunk({ chunkId: "one", content: textOfLength(4) }), // 1 token → total 10000
      makeRankedChunk({ chunkId: "overflow", content: textOfLength(4) }),
    ];
    const kept = fitChunksToBudget(chunks);
    expect(kept.map((c) => c.chunkId)).toEqual(["big", "one"]);
  });

  it("does not mutate or reorder the input array", () => {
    const chunks = Array.from({ length: 12 }, (_, i) =>
      makeRankedChunk({ chunkId: `c${i}`, content: textOfLength(4000) }),
    );
    const snapshot = chunks.map((c) => c.chunkId);
    fitChunksToBudget(chunks);
    expect(chunks.map((c) => c.chunkId)).toEqual(snapshot);
  });
});
