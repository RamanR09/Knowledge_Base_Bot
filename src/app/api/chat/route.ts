import { NextRequest } from "next/server";
import { z } from "zod";
import { answerQuestion } from "@/lib/rag/chat";
import { allow, chatLimiter } from "@/lib/rateLimit";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../_helpers/errors";

const bodySchema = z.object({
  conversationId: z.uuid("A valid conversationId is required"),
  question: z.string().min(1, "Question is required").max(4000),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!(await allow(chatLimiter, user.id))) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: 20 chat requests per minute" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
    const body = bodySchema.parse(await req.json());
    const stream = await answerQuestion({
      conversationId: body.conversationId,
      userId: user.id,
      question: body.question,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
