import type {
  DocumentBlockParam,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { anthropic, MODELS } from "@/lib/llm/anthropic";
import { cliBridgeAvailable, runClaudeCli } from "@/lib/llm/claudeCli";
import { GROUNDED_ANSWER_SYSTEM_V1 } from "@/lib/llm/prompts";
import type { ChatTurn } from "@/lib/rag/queryPlanner";
import type { RankedChunk } from "@/lib/rag/rerankChunks";

export type GenEvent =
  | { type: "text"; delta: string }
  | { type: "citation"; documentIndex: number; citedText: string }
  | { type: "done"; usage: unknown; fullText: string; stopReason: string | null };

/** Last N messages (N/2 exchanges) of history sent to the model. */
const HISTORY_TURNS = 20;
const MAX_OUTPUT_TOKENS = 8192;
/** Token budget for retrieved chunk content in the prompt. */
const CONTEXT_TOKEN_BUDGET = 10_000;

/** Cheap local token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trim the ranked chunk list (in order) so the summed estimated tokens of the
 * chunk contents fit the context budget. Exported so callers (chat
 * orchestrator) can compute the exact chunk list whose order defines
 * `document_index` in citations.
 */
export function fitChunksToBudget(chunks: RankedChunk[]): RankedChunk[] {
  const kept: RankedChunk[] = [];
  let total = 0;
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.content);
    if (kept.length > 0 && total + cost > CONTEXT_TOKEN_BUDGET) break;
    kept.push(chunk);
    total += cost;
    if (total >= CONTEXT_TOKEN_BUDGET) break;
  }
  return kept;
}

function documentTitle(chunk: RankedChunk): string {
  let title = chunk.documentTitle;
  if (chunk.headingPath.length > 0) {
    title += ` — ${chunk.headingPath.join(" > ")}`;
  }
  if (chunk.pageStart !== null) {
    title +=
      chunk.pageEnd !== null && chunk.pageEnd !== chunk.pageStart
        ? ` (pages ${chunk.pageStart}-${chunk.pageEnd})`
        : ` (page ${chunk.pageStart})`;
  }
  return title;
}

/** Retrieved content is UNTRUSTED: it goes in user-turn document blocks only. */
function buildDocumentBlocks(chunks: RankedChunk[]): DocumentBlockParam[] {
  return chunks.map((chunk) => ({
    type: "document",
    source: {
      type: "content",
      content: [{ type: "text", text: chunk.content }],
    },
    title: documentTitle(chunk),
    citations: { enabled: true },
  }));
}

/**
 * Stream a grounded answer with native citations. Yields text deltas and
 * citation events as they arrive, then a final `done` event with usage and
 * the accumulated answer text.
 *
 * `document_index` in citation events refers to the order of document blocks,
 * which is the order of `fitChunksToBudget(params.chunks)`.
 */
export async function* generateAnswer(params: {
  question: string;
  history: ChatTurn[];
  chunks: RankedChunk[];
}): AsyncGenerator<GenEvent, void, void> {
  const chunks = fitChunksToBudget(params.chunks);

  // DEV-ONLY: no API key configured → answer via the local Claude Code CLI
  // (the developer's own subscription). No native citations in this mode.
  if (cliBridgeAvailable()) {
    yield* generateViaCliBridge(params.question, params.history, chunks);
    return;
  }

  const system: TextBlockParam[] = [
    {
      type: "text",
      text: GROUNDED_ANSWER_SYSTEM_V1,
      cache_control: { type: "ephemeral" },
    },
  ];

  const historyMessages: MessageParam[] = params.history
    .slice(-HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  const finalUserMessage: MessageParam = {
    role: "user",
    content: [...buildDocumentBlocks(chunks), { type: "text", text: params.question }],
  };

  const stream = anthropic().messages.stream({
    model: MODELS.generation,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [...historyMessages, finalUserMessage],
  });

  let fullText = "";
  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;
    const delta = event.delta;
    if (delta.type === "text_delta") {
      fullText += delta.text;
      yield { type: "text", delta: delta.text };
    } else if (delta.type === "citations_delta") {
      const citation = delta.citation;
      // Only document-sourced citation locations carry a document_index;
      // web/search-result locations cannot occur here (no server tools).
      if ("document_index" in citation) {
        yield {
          type: "citation",
          documentIndex: citation.document_index,
          citedText: citation.cited_text,
        };
      }
    }
  }

  const finalMessage = await stream.finalMessage();
  yield {
    type: "done",
    usage: finalMessage.usage,
    fullText,
    stopReason: finalMessage.stop_reason,
  };
}

/** Dev-mode generation through the local Claude Code CLI (no native citations). */
async function* generateViaCliBridge(
  question: string,
  history: ChatTurn[],
  chunks: RankedChunk[],
): AsyncGenerator<GenEvent, void, void> {
  const sources = chunks
    .map((c, i) => `[Source ${i + 1}: ${documentTitle(c)}]\n${c.content}`)
    .join("\n\n---\n\n");
  const transcript = history
    .slice(-HISTORY_TURNS)
    .map((t) => `${t.role}: ${t.content.slice(0, 500)}`)
    .join("\n");
  const prompt =
    `${GROUNDED_ANSWER_SYSTEM_V1}\n\n` +
    `When you rely on a source, reference it inline as [Source N].\n\n` +
    `<sources>\n${sources}\n</sources>\n\n` +
    (transcript ? `<conversation_history>\n${transcript}\n</conversation_history>\n\n` : "") +
    `Question: ${question}\n\n` +
    `Answer only from the sources above. Do not use any tools.`;

  const notice =
    "_Dev mode: answered via the local Claude Code CLI (no ANTHROPIC_API_KEY set). " +
    "Citation chips are unavailable in this mode — sources are referenced inline._\n\n";
  yield { type: "text", delta: notice };
  const { text, usage } = await runClaudeCli(prompt);
  yield { type: "text", delta: text };
  yield { type: "done", usage, fullText: notice + text, stopReason: null };
}
