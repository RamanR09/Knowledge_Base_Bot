import pino from "pino";
import { z } from "zod";
import { anthropic, MODELS } from "@/lib/llm/anthropic";
import { QUERY_PLANNER_V1 } from "@/lib/llm/prompts";

const logger = pino({ name: "rag:queryPlanner" });

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface QueryPlan {
  rewritten: string;
  subQueries: string[];
}

const planSchema = z.object({
  rewritten: z.string().min(1),
  subQueries: z.array(z.string().min(1)).min(1).max(3),
});

const HISTORY_TURNS = 10;
const TURN_CHAR_LIMIT = 500;

/** Compact the conversation history into a plain-text transcript. */
function compactHistory(history: ChatTurn[]): string {
  return history
    .slice(-HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, TURN_CHAR_LIMIT)}`)
    .join("\n");
}

/**
 * Rewrite the latest question to be self-contained and decompose it into 1-3
 * retrieval sub-queries. Never throws: on any failure it falls back to using
 * the raw question so the chat keeps working.
 */
export async function planQuery(history: ChatTurn[], question: string): Promise<QueryPlan> {
  const fallback: QueryPlan = { rewritten: question, subQueries: [question] };
  try {
    const transcript = compactHistory(history);
    const response = await anthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 500,
      system: QUERY_PLANNER_V1,
      tools: [
        {
          name: "emit_plan",
          description:
            "Emit the rewritten self-contained question and 1-3 focused retrieval sub-queries.",
          input_schema: {
            type: "object",
            properties: {
              rewritten: {
                type: "string",
                description: "The user question rewritten to be fully self-contained.",
              },
              subQueries: {
                type: "array",
                items: { type: "string" },
                minItems: 1,
                maxItems: 3,
                description: "1-3 short keyword-rich search queries.",
              },
            },
            required: ["rewritten", "subQueries"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "emit_plan" },
      messages: [
        {
          role: "user",
          content:
            (transcript ? `Conversation so far:\n${transcript}\n\n` : "") +
            `Latest user question:\n${question}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block) => block.type === "tool_use" && block.name === "emit_plan",
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      logger.warn("query planner returned no emit_plan tool_use; falling back");
      return fallback;
    }
    const parsed = planSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "query planner output failed validation");
      return fallback;
    }
    return parsed.data;
  } catch (error) {
    logger.warn({ err: error }, "query planner failed; falling back to raw question");
    return fallback;
  }
}
