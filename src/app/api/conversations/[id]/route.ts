import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../../_helpers/errors";
import { getConversationWithMessages } from "../../_helpers/conversations";

const idSchema = z.uuid("A valid conversation id is required");

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    const id = idSchema.parse((await ctx.params).id);
    const detail = await getConversationWithMessages(id, user.id);
    if (!detail) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSessionUser();
    const id = idSchema.parse((await ctx.params).id);
    const [owned] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
      .limit(1);
    if (!owned) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    await db.delete(conversations).where(eq(conversations.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
