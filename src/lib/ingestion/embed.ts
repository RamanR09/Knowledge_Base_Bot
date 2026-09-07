import { embedDocuments } from "@/lib/llm/voyage";

export interface EmbeddableChunk {
  content: string;
  /** Contextual-retrieval situating prefix; empty string when disabled/failed. */
  contextPrefix: string;
}

/**
 * Embed chunks for storage. The embedded text is `contextPrefix + "\n" +
 * content` (just the content when the prefix is empty) so the situating
 * context improves retrieval without ever being shown or cited.
 * Batching against the Voyage API is handled inside `embedDocuments`.
 */
export async function embedChunks(chunks: EmbeddableChunk[]): Promise<number[][]> {
  if (chunks.length === 0) return [];
  const texts = chunks.map((c) =>
    c.contextPrefix ? `${c.contextPrefix}\n${c.content}` : c.content,
  );
  try {
    return await embedDocuments(texts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/status code:\s*429|rate.?limit/i.test(message)) {
      // Recognizable prefix — the UI renders this as a "Rate limited" state.
      throw new Error(
        "RATE_LIMITED: Voyage embedding rate limit hit (free tier without a payment " +
          "method = 3 requests/min). Ingestion retries automatically; add a payment " +
          "method at dashboard.voyageai.com to lift the cap (free tokens still apply).",
      );
    }
    throw error;
  }
}
