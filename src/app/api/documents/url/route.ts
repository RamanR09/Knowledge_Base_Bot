import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enqueueUrl } from "@/lib/ingestion/enqueue";
import { requireSessionUser } from "@/lib/session";
import { apiError, enqueueError } from "../../_helpers/errors";

const addUrlSchema = z.object({
  url: z.url("A valid URL is required"),
  collectionId: z.uuid("A valid collectionId is required"),
  crawl: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = addUrlSchema.parse(await req.json());
    try {
      const result = await enqueueUrl({
        url: body.url,
        crawl: body.crawl,
        collectionId: body.collectionId,
        userId: user.id,
      });
      return NextResponse.json(result, { status: 202 });
    } catch (err) {
      return enqueueError(err);
    }
  } catch (err) {
    return apiError(err);
  }
}
