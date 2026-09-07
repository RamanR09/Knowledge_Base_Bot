import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collections, conversations } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../_helpers/errors";
import { listConversations } from "../_helpers/conversations";

const createConversationSchema = z.object({
  collectionId: z.uuid("A valid collectionId is required").nullish(),
});

export async function GET() {
  try {
    const user = await requireSessionUser();
    return NextResponse.json(await listConversations(user.id));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const raw: unknown = await req.json().catch(() => ({}));
    const body = createConversationSchema.parse(raw ?? {});
    const collectionId = body.collectionId ?? null;

    if (collectionId) {
      const [collection] = await db
        .select({ id: collections.id })
        .from(collections)
        .where(eq(collections.id, collectionId))
        .limit(1);
      if (!collection) {
        return NextResponse.json({ error: "Collection not found" }, { status: 400 });
      }
    }

    const [row] = await db
      .insert(conversations)
      .values({ userId: user.id, collectionId })
      .returning({
        id: conversations.id,
        title: conversations.title,
        collectionId: conversations.collectionId,
        updatedAt: conversations.updatedAt,
      });
    return NextResponse.json(
      { ...row, updatedAt: row.updatedAt.toISOString() },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err);
  }
}
