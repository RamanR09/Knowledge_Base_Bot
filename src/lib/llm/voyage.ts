import { VoyageAIClient } from "voyageai";
import { requireEnv } from "@/lib/env";

export const EMBEDDING_MODEL = "voyage-3-large";
export const EMBEDDING_DIMENSIONS = 1024;
export const RERANK_MODEL = "rerank-2.5";
/** Voyage embed API caps batches; we stay comfortably under limits. */
export const EMBED_BATCH_SIZE = 128;

let client: VoyageAIClient | undefined;

function voyage(): VoyageAIClient {
  if (!client) {
    client = new VoyageAIClient({ apiKey: requireEnv("VOYAGE_API_KEY") });
  }
  return client;
}

/** Embed document chunks (batched). Returns embeddings in input order. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await voyage().embed({
      input: batch,
      model: EMBEDDING_MODEL,
      inputType: "document",
      outputDimension: EMBEDDING_DIMENSIONS,
    });
    const data = res.data ?? [];
    if (data.length !== batch.length) {
      throw new Error(`Voyage embed returned ${data.length} embeddings for ${batch.length} inputs`);
    }
    for (const item of data) {
      if (!item.embedding) throw new Error("Voyage embed item missing embedding");
      out.push(item.embedding);
    }
  }
  return out;
}

/** Embed a search query (asymmetric embedding). */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await voyage().embed({
    input: [text],
    model: EMBEDDING_MODEL,
    inputType: "query",
    outputDimension: EMBEDDING_DIMENSIONS,
  });
  const embedding = res.data?.[0]?.embedding;
  if (!embedding) throw new Error("Voyage query embed returned no embedding");
  return embedding;
}

export interface RerankResult {
  /** Index into the input documents array. */
  index: number;
  relevanceScore: number;
}

/** Rerank candidate texts against a query; returns results sorted by relevance desc. */
export async function rerank(
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];
  const res = await voyage().rerank({
    query,
    documents,
    model: RERANK_MODEL,
    topK,
  });
  return (res.data ?? []).map((r) => ({
    index: r.index ?? 0,
    relevanceScore: r.relevanceScore ?? 0,
  }));
}
