import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documentChunks, documents } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../../_helpers/errors";

const idSchema = z.uuid("A valid chunk id is required");

/** Chunk content + document metadata for the source viewer. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSessionUser();
    const id = idSchema.parse((await ctx.params).id);
    const [row] = await db
      .select({
        id: documentChunks.id,
        content: documentChunks.content,
        headingPath: documentChunks.headingPath,
        pageStart: documentChunks.pageStart,
        pageEnd: documentChunks.pageEnd,
        documentTitle: documents.title,
        sourceType: documents.sourceType,
        sourceUrl: documents.sourceUrl,
      })
      .from(documentChunks)
      .innerJoin(documents, eq(documentChunks.documentId, documents.id))
      .where(eq(documentChunks.id, id))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err);
  }
}
