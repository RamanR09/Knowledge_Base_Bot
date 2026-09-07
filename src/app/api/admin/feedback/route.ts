import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, feedback, messages, user } from "@/db/schema";
import type { AdminFeedbackDto } from "@/components/admin/types";
import { apiError } from "../../_helpers/errors";
import { requireAdmin } from "../_helpers/auth";

const RESULT_LIMIT = 100;
const PREVIEW_MAX_CHARS = 300;

export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        promotedToEvalCase: feedback.promotedToEvalCase,
        createdAt: feedback.createdAt,
        messageId: feedback.messageId,
        messageContent: messages.content,
        conversationTitle: conversations.title,
        userEmail: user.email,
      })
      .from(feedback)
      .innerJoin(messages, eq(feedback.messageId, messages.id))
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .innerJoin(user, eq(feedback.userId, user.id))
      .orderBy(desc(feedback.createdAt))
      .limit(RESULT_LIMIT);

    const payload: AdminFeedbackDto[] = rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      comment: row.comment,
      messageId: row.messageId,
      messagePreview: row.messageContent.slice(0, PREVIEW_MAX_CHARS),
      conversationTitle: row.conversationTitle,
      userEmail: row.userEmail,
      promotedToEvalCase: row.promotedToEvalCase,
      createdAt: row.createdAt.toISOString(),
    }));
    return NextResponse.json(payload);
  } catch (err) {
    return apiError(err);
  }
}
