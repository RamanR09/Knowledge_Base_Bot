import { MODELS, anthropic } from "@/lib/llm/anthropic";
import { CONTEXTUALIZE_CHUNK_V1 } from "@/lib/llm/prompts";
import type { Chunk } from "./types";

/** Keep the cached document prefix within a safe context-window budget. */
const MAX_DOC_CHARS = 150_000;
const CONCURRENCY = 5;
const MAX_OUTPUT_TOKENS = 150;

/**
 * Anthropic contextual retrieval: for each chunk, generate a 1-2 sentence
 * situating prefix using the fast model. The full document text is sent as
 * the first user text block with `cache_control` so all chunk calls share a
 * cached prefix. Per-chunk failures degrade to an empty prefix — a missing
 * prefix must never fail ingestion.
 */
export async function contextualizeChunks(docText: string, chunks: Chunk[]): Promise<string[]> {
  if (chunks.length === 0) return [];
  const truncated = docText.length > MAX_DOC_CHARS ? docText.slice(0, MAX_DOC_CHARS) : docText;
  const results = new Array<string>(chunks.length).fill("");

  let next = 0;
  const runWorker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= chunks.length) return;
      try {
        results[i] = await contextualizeOne(truncated, chunks[i]);
      } catch {
        results[i] = "";
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, () => runWorker()),
  );
  return results;
}

async function contextualizeOne(docText: string, chunk: Chunk): Promise<string> {
  const res = await anthropic().messages.create({
    model: MODELS.fast,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `<document>\n${docText}\n</document>`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `${CONTEXTUALIZE_CHUNK_V1}\n<chunk>\n${chunk.content}\n</chunk>`,
          },
        ],
      },
    ],
  });
  return res.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join(" ")
    .trim();
}
