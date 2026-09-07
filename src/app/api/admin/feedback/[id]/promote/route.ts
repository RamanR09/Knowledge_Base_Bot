import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { evalCases, feedback, messageCitations, messages } from "@/db/schema";
import type { PromoteResponse } from "@/components/admin/types";
import { apiError } from "../../../../_helpers/errors";
import { requireAdmin } from "../../../_helpers/auth";

const idSchema = z.uuid("A valid feedback id is required");

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Promote a feedback row to an eval case:
 * question = the user message preceding the rated assistant message,
 * expectedAnswer = "" (admin curates it later in evals),
 * expectedDocumentIds = the assistant message's cited document ids,
 * inactive until curated. Marks feedback.promotedToEvalCase in the same
 * transaction.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const feedbackId = idSchema.parse((await ctx.params).id);

    const evalCaseId = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          promotedToEvalCase: feedback.promotedToEvalCase,
          messageId: messages.id,
          messageRole: messages.role,
          messageCreatedAt: messages.createdAt,
          conversationId: messages.conversationId,
        })
        .from(feedback)
        .innerJoin(messages, eq(feedback.messageId, messages.id))
        .where(eq(feedback.id, feedbackId))
        .limit(1);

      if (!row) throw httpError("Feedback not found", 404);
      if (row.promotedToEvalCase) {
        throw httpError("Feedback is already promoted to an eval case", 409);
      }
      if (row.messageRole !== "assistant") {
        throw httpError("Only feedback on assistant messages can be promoted", 409);
      }

      // The user question immediately preceding the rated assistant message.
      const [question] = await tx
        .select({ content: messages.content })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, row.conversationId),
            eq(messages.role, "user"),
            lt(messages.createdAt, row.messageCreatedAt),
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(1);
      if (!question) {
        throw httpError("No preceding user question found for this message", 409);
      }

      const citations = await tx
        .select({ documentId: messageCitations.documentId })
        .from(messageCitations)
        .where(eq(messageCitations.messageId, row.messageId));
      const expectedDocumentIds = [
        ...new Set(citations.map((c) => c.documentId)),
      ];

      const [created] = await tx
        .insert(evalCases)
        .values({
          question: question.content,
          expectedAnswer: "", // placeholder — admin curates it in evals
          expectedDocumentIds,
          tags: ["from-feedback"],
          active: false, // inactive until curated
        })
        .returning({ id: evalCases.id });

      await tx
        .update(feedback)
        .set({ promotedToEvalCase: true })
        .where(eq(feedback.id, feedbackId));

      return created.id;
    });

    const payload: PromoteResponse = { evalCaseId };
    return NextResponse.json(payload, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
