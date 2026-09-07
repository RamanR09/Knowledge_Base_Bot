import { asc, eq } from "drizzle-orm";
import pino from "pino";
import { db } from "@/db";
import {
  conversations,
  messageCitations,
  messages as messagesTable,
} from "@/db/schema";
import { checkInput, type InputVerdict } from "@/lib/guardrails/input";
import { checkOutput } from "@/lib/guardrails/output";
import { MODELS } from "@/lib/llm/anthropic";
import { type CitationEvent, mapCitations } from "@/lib/rag/citations";
import { fitChunksToBudget, generateAnswer } from "@/lib/rag/generate";
import { type ChatTurn, planQuery } from "@/lib/rag/queryPlanner";
import { rerankChunks } from "@/lib/rag/rerankChunks";
import { retrieveForQuestion } from "@/lib/rag/retrieve";

const logger = pino({ name: "rag:chat" });

/** Last N messages (10 exchanges) loaded as model history. */
const HISTORY_TURNS = 20;
const TITLE_MAX_CHARS = 60;
const DEFAULT_TITLE = "New conversation";
const REFUSAL_TEXT =
  "I can't help with that request. Please ask a question about the knowledge base.";

/** SSE events emitted by the chat stream (consumed by the API route). */
type SseEvent =
  | { type: "guardrail_blocked"; category: string }
  | { type: "text"; delta: string }
  | {
      type: "citation";
      ordinal: number;
      chunkId: string;
      documentId: string;
      documentTitle: string;
      page: number | null;
    }
  | { type: "done"; messageId: string; conversationId: string }
  | { type: "error"; message: string };

/** Update a still-default conversation title from the first question. */
async function maybeSetTitle(
  tx: Pick<typeof db, "update">,
  conversationId: string,
  currentTitle: string,
  question: string,
): Promise<void> {
  if (currentTitle !== DEFAULT_TITLE) return;
  await tx
    .update(conversations)
    .set({ title: question.slice(0, TITLE_MAX_CHARS), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

/**
 * Full RAG chat turn: guardrails + query planning (in parallel) → hybrid
 * retrieval → rerank → grounded streaming generation with citations →
 * transactional persistence. Returns an SSE byte stream.
 */
export async function answerQuestion(params: {
  conversationId: string;
  userId: string;
  question: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { conversationId, userId, question } = params;
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const conversation = await db.query.conversations.findFirst({
          where: eq(conversations.id, conversationId),
        });
        if (!conversation || conversation.userId !== userId) {
          emit({ type: "error", message: "Conversation not found." });
          controller.close();
          return;
        }

        const historyRows = await db
          .select({ role: messagesTable.role, content: messagesTable.content })
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversationId))
          .orderBy(asc(messagesTable.createdAt));
        const history: ChatTurn[] = historyRows.slice(-HISTORY_TURNS);

        const [inputVerdict, plan] = await Promise.all([
          checkInput(question),
          planQuery(history, question),
        ]);

        if (!inputVerdict.allowed) {
          const messageId = await persistBlockedTurn(
            conversationId,
            conversation.title,
            question,
            inputVerdict,
          );
          emit({ type: "guardrail_blocked", category: inputVerdict.category });
          emit({ type: "done", messageId, conversationId });
          controller.close();
          return;
        }

        const pool = await retrieveForQuestion(plan.subQueries, {
          collectionId: conversation.collectionId ?? undefined,
        });
        const ranked = await rerankChunks(plan.rewritten, pool);
        // The exact list sent to the model; its order defines document_index.
        const contextChunks = fitChunksToBudget(ranked);

        const citationEvents: CitationEvent[] = [];
        let fullText = "";
        let usage: unknown = null;
        let stopReason: string | null = null;
        for await (const event of generateAnswer({
          question,
          history,
          chunks: contextChunks,
        })) {
          if (event.type === "text") {
            fullText += event.delta;
            emit({ type: "text", delta: event.delta });
          } else if (event.type === "citation") {
            citationEvents.push({
              documentIndex: event.documentIndex,
              citedText: event.citedText,
            });
          } else {
            fullText = event.fullText;
            usage = event.usage;
            stopReason = event.stopReason;
          }
        }

        // Safety classifiers can decline a request (stop_reason "refusal").
        // Surface a readable message instead of an empty bubble.
        if (stopReason === "refusal" && fullText.trim().length === 0) {
          fullText = REFUSAL_TEXT;
          emit({ type: "text", delta: REFUSAL_TEXT });
        }

        const citationRecords = mapCitations(citationEvents, contextChunks);
        const outputVerdict = checkOutput(fullText, citationRecords.length);

        const chunkById = new Map(contextChunks.map((c) => [c.chunkId, c]));

        const assistantMessageId = await db.transaction(async (tx) => {
          await tx.insert(messagesTable).values({
            conversationId,
            role: "user",
            content: question,
          });
          const [assistant] = await tx
            .insert(messagesTable)
            .values({
              conversationId,
              role: "assistant",
              content: fullText,
              model: MODELS.generation,
              usage,
              retrievalDebug: {
                rewritten: plan.rewritten,
                subQueries: plan.subQueries,
                chunkIds: contextChunks.map((c) => c.chunkId),
                scores: contextChunks.map((c) => c.relevanceScore),
              },
              guardrailFlags: {
                input: inputVerdict,
                output: { ...outputVerdict, refusal: stopReason === "refusal" },
              },
            })
            .returning({ id: messagesTable.id });
          if (citationRecords.length > 0) {
            await tx.insert(messageCitations).values(
              citationRecords.map((record) => ({
                messageId: assistant.id,
                chunkId: record.chunkId,
                documentId: record.documentId,
                citedText: record.citedText,
                startPage: record.startPage,
                endPage: record.endPage,
                ordinal: record.ordinal,
              })),
            );
          }
          await maybeSetTitle(tx, conversationId, conversation.title, question);
          return assistant.id;
        });

        for (const record of citationRecords) {
          const chunk = chunkById.get(record.chunkId);
          emit({
            type: "citation",
            ordinal: record.ordinal,
            chunkId: record.chunkId,
            documentId: record.documentId,
            documentTitle: chunk?.documentTitle ?? "",
            page: record.startPage,
          });
        }
        emit({ type: "done", messageId: assistantMessageId, conversationId });
        controller.close();
      } catch (error) {
        logger.error({ err: error }, "chat turn failed");
        try {
          emit({
            type: "error",
            message: error instanceof Error ? error.message : "Something went wrong.",
          });
        } catch {
          // Controller already closed — nothing left to signal.
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });
}

/** Persist a guardrail-blocked turn (user message + assistant refusal). */
async function persistBlockedTurn(
  conversationId: string,
  currentTitle: string,
  question: string,
  inputVerdict: InputVerdict,
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.insert(messagesTable).values({
      conversationId,
      role: "user",
      content: question,
    });
    const [assistant] = await tx
      .insert(messagesTable)
      .values({
        conversationId,
        role: "assistant",
        content: REFUSAL_TEXT,
        guardrailFlags: { input: inputVerdict },
      })
      .returning({ id: messagesTable.id });
    await maybeSetTitle(tx, conversationId, currentTitle, question);
    return assistant.id;
  });
}
