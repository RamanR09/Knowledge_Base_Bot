import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../../_helpers/errors";

const idSchema = z.uuid("A valid document id is required");

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSessionUser();
    const { id } = await ctx.params;
    const documentId = idSchema.parse(id);
    const [existing] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    // Chunks and ingestion jobs cascade via FK on delete.
    await db.delete(documents).where(eq(documents.id, documentId));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
