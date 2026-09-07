import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enqueueUpload } from "@/lib/ingestion/enqueue";
import { allow, uploadLimiter } from "@/lib/rateLimit";
import { requireSessionUser } from "@/lib/session";
import { apiError, enqueueError } from "../_helpers/errors";

const collectionIdSchema = z.uuid("A valid collectionId is required");

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!(await allow(uploadLimiter, user.id))) {
      return NextResponse.json(
        { error: "Rate limit exceeded: 30 uploads per hour" },
        { status: 429 },
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    const collectionId = collectionIdSchema.parse(form.get("collectionId"));
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 50MB limit" },
        { status: 413 },
      );
    }
    const data = Buffer.from(await file.arrayBuffer());
    try {
      const result = await enqueueUpload({
        data,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        collectionId,
        userId: user.id,
      });
      return NextResponse.json(result, { status: 202 });
    } catch (err) {
      // Validation reasons from the enqueue contract surface as 4xx with message.
      return enqueueError(err);
    }
  } catch (err) {
    return apiError(err);
  }
}
