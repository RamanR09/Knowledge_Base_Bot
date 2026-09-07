import pino from "pino";
import { rerank } from "@/lib/llm/voyage";
import type { RetrievedChunk } from "@/lib/rag/retrieve";

const logger = pino({ name: "rag:rerank" });

export interface RankedChunk extends RetrievedChunk {
  relevanceScore: number;
}

const MIN_RELEVANCE = 0.3;

/**
 * Group chunks by document (documents ordered by their best-ranked chunk's
 * first appearance) and order chunks within each document by chunkIndex, so
 * adjacent passages read coherently in the generation context.
 */
function groupByDocument(chunks: RankedChunk[]): RankedChunk[] {
  const byDocument = new Map<string, RankedChunk[]>();
  for (const chunk of chunks) {
    const group = byDocument.get(chunk.documentId);
    if (group) group.push(chunk);
    else byDocument.set(chunk.documentId, [chunk]);
  }
  const out: RankedChunk[] = [];
  for (const group of byDocument.values()) {
    out.push(...group.sort((a, b) => a.chunkIndex - b.chunkIndex));
  }
  return out;
}

/**
 * Rerank the hybrid-retrieval pool against the original question with Voyage
 * rerank-2.5, keep confident matches, and group for readability. Falls back to
 * RRF ordering if the reranker fails — never breaks the chat.
 */
export async function rerankChunks(
  originalQuestion: string,
  chunks: RetrievedChunk[],
  topK = 12,
): Promise<RankedChunk[]> {
  if (chunks.length === 0) return [];
  try {
    const documents = chunks.map((c) =>
      c.contextPrefix ? `${c.contextPrefix}\n${c.content}` : c.content,
    );
    const results = await rerank(originalQuestion, documents, topK);
    const ranked = results
      .filter((r) => r.relevanceScore >= MIN_RELEVANCE)
      .flatMap((r) => {
        const chunk = chunks[r.index];
        return chunk ? [{ ...chunk, relevanceScore: r.relevanceScore }] : [];
      });
    return groupByDocument(ranked);
  } catch (error) {
    logger.warn({ err: error }, "rerank failed; falling back to RRF top-K");
    const fallback = [...chunks]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK)
      .map((c) => ({ ...c, relevanceScore: c.rrfScore }));
    return groupByDocument(fallback);
  }
}
