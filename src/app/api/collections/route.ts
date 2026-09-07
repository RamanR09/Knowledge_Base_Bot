import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collections, documents } from "@/db/schema";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../_helpers/errors";

const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    await requireSessionUser();
    const rows = await db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        createdAt: collections.createdAt,
        documentCount: count(documents.id),
      })
      .from(collections)
      .leftJoin(documents, eq(documents.collectionId, collections.id))
      .groupBy(collections.id)
      .orderBy(asc(collections.createdAt));
    return NextResponse.json(rows);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = createCollectionSchema.parse(await req.json());
    const [row] = await db
      .insert(collections)
      .values({
        name: body.name,
        description: body.description ?? null,
        createdBy: user.id,
      })
      .returning({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        createdAt: collections.createdAt,
      });
    return NextResponse.json({ ...row, documentCount: 0 }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
