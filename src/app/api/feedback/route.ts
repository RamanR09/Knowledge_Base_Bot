import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, feedback, messages } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../_helpers/errors";

const feedbackSchema = z.object({
  messageId: z.uuid("A valid messageId is required"),
  rating: z.enum(["up", "down"]),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = feedbackSchema.parse(await req.json());

    // Only accept feedback on messages in the user's own conversations.
    const [message] = await db
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(messages.id, body.messageId), eq(conversations.userId, user.id)))
      .limit(1);
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await db
      .insert(feedback)
      .values({
        messageId: body.messageId,
        userId: user.id,
        rating: body.rating,
        comment: body.comment ?? null,
      })
      .onConflictDoUpdate({
        target: [feedback.messageId, feedback.userId],
        set: { rating: body.rating, comment: body.comment ?? null },
      });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
