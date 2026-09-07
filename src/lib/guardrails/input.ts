import pino from "pino";
import { z } from "zod";
import { matchesInjectionPattern } from "@/lib/guardrails/patterns";
import { anthropic, MODELS } from "@/lib/llm/anthropic";
import { INPUT_GUARD_V1 } from "@/lib/llm/prompts";

const logger = pino({ name: "guardrails:input" });

export type InputCategory = "safe" | "injection" | "off_topic" | "abuse";

export interface InputVerdict {
  allowed: boolean;
  category: InputCategory;
  source: "heuristic" | "classifier";
  confidence?: number;
}

const MAX_QUESTION_CHARS = 4000;
/** Classifier verdicts below this confidence do not block (fail toward users). */
const BLOCK_CONFIDENCE = 0.7;

const verdictSchema = z.object({
  category: z.enum(["safe", "injection", "off_topic", "abuse"]),
  confidence: z.number().min(0).max(1),
});

/**
 * Input gate: cheap deterministic heuristics first, then a fast LLM
 * classifier. Fails OPEN on classifier errors — a broken guardrail must not
 * take down the chat.
 */
export async function checkInput(question: string): Promise<InputVerdict> {
  if (question.length > MAX_QUESTION_CHARS) {
    return { allowed: false, category: "abuse", source: "heuristic" };
  }
  if (matchesInjectionPattern(question)) {
    return { allowed: false, category: "injection", source: "heuristic" };
  }

  try {
    const response = await anthropic().messages.create({
      model: MODELS.fast,
      max_tokens: 200,
      system: INPUT_GUARD_V1,
      tools: [
        {
          name: "emit_verdict",
          description: "Emit the classification verdict for the user message.",
          input_schema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["safe", "injection", "off_topic", "abuse"],
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence in the chosen category, 0-1.",
              },
            },
            required: ["category", "confidence"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "emit_verdict" },
      messages: [{ role: "user", content: question }],
    });

    const toolUse = response.content.find(
      (block) => block.type === "tool_use" && block.name === "emit_verdict",
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      logger.warn("input classifier returned no emit_verdict tool_use; allowing");
      return { allowed: true, category: "safe", source: "classifier" };
    }
    const parsed = verdictSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "input classifier output invalid; allowing");
      return { allowed: true, category: "safe", source: "classifier" };
    }
    const { category, confidence } = parsed.data;
    const blocked = category !== "safe" && confidence >= BLOCK_CONFIDENCE;
    return { allowed: !blocked, category, source: "classifier", confidence };
  } catch (error) {
    logger.warn({ err: error }, "input classifier failed; failing open");
    return { allowed: true, category: "safe", source: "classifier" };
  }
}
