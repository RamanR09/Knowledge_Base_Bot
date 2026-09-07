/**
 * LLM-as-judge scoring for the eval harness. Uses the strong generation model
 * with the versioned judge prompts and a forced `emit_score` tool so output is
 * structured and zod-validated. Requires ANTHROPIC_API_KEY at call time.
 */
import { z } from "zod";
import { anthropic, MODELS } from "@/lib/llm/anthropic";
import { JUDGE_FAITHFULNESS_V1, JUDGE_RELEVANCE_V1 } from "@/lib/llm/prompts";

export interface JudgeScore {
  score: number;
  reasoning: string;
}

const scoreSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
});

async function judge(systemPrompt: string, userContent: string): Promise<JudgeScore> {
  const response = await anthropic().messages.create({
    model: MODELS.generation,
    max_tokens: 500,
    system: systemPrompt,
    tools: [
      {
        name: "emit_score",
        description: "Emit the grade for the answer being judged.",
        input_schema: {
          type: "object",
          properties: {
            score: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "The grade, 0.0-1.0, per the rubric in the system prompt.",
            },
            reasoning: {
              type: "string",
              description: "One or two sentences explaining the grade.",
            },
          },
          required: ["score", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "emit_score" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "emit_score",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("judge returned no emit_score tool_use block");
  }
  return scoreSchema.parse(toolUse.input);
}

/** Is every factual claim in `answer` supported by `sourcesText`? */
export function judgeFaithfulness(
  question: string,
  answer: string,
  sourcesText: string,
): Promise<JudgeScore> {
  return judge(
    JUDGE_FAITHFULNESS_V1,
    `<question>\n${question}\n</question>\n\n` +
      `<source_excerpts>\n${sourcesText}\n</source_excerpts>\n\n` +
      `<answer>\n${answer}\n</answer>`,
  );
}

/** Does `answer` actually answer `question`? */
export function judgeRelevance(question: string, answer: string): Promise<JudgeScore> {
  return judge(
    JUDGE_RELEVANCE_V1,
    `<question>\n${question}\n</question>\n\n<answer>\n${answer}\n</answer>`,
  );
}
