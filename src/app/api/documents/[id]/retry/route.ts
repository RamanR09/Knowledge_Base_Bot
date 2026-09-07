import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { retryDocument } from "@/lib/ingestion/retry";
import { requireSessionUser } from "@/lib/session";
import { apiError } from "../../../_helpers/errors";

const idSchema = z.uuid("A valid document id is required");

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireSessionUser();
    const id = idSchema.parse((await ctx.params).id);
    const queued = await retryDocument(id);
    if (!queued) {
      return NextResponse.json(
        { error: "document is not in a failed state" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
