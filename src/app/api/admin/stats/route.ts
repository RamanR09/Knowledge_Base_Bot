import { NextResponse } from "next/server";
import { count, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  documentChunks,
  documents,
  feedback,
  messages,
} from "@/db/schema";
import type { AdminStatsDto } from "@/components/admin/types";
import type { DocumentStatus } from "@/components/documents/types";
import { apiError } from "../../_helpers/errors";
import { requireAdmin } from "../_helpers/auth";

const ALL_STATUSES: readonly DocumentStatus[] = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "ready",
  "failed",
];

export async function GET() {
  try {
    await requireAdmin();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [statusRows, chunkRows, conversationRows, messageRows, feedbackRows] =
      await Promise.all([
        db
          .select({ status: documents.status, count: count() })
          .from(documents)
          .groupBy(documents.status),
        db.select({ count: count() }).from(documentChunks),
        db.select({ count: count() }).from(conversations),
        db
          .select({ count: count() })
          .from(messages)
          .where(gte(messages.createdAt, sevenDaysAgo)),
        db
          .select({ rating: feedback.rating, count: count() })
          .from(feedback)
          .groupBy(feedback.rating),
      ]);

    const documentCounts = Object.fromEntries(
      ALL_STATUSES.map((status) => [status, 0]),
    ) as Record<DocumentStatus, number>;
    for (const row of statusRows) documentCounts[row.status] = row.count;

    const ratings = { up: 0, down: 0 };
    for (const row of feedbackRows) ratings[row.rating] = row.count;

    const payload: AdminStatsDto = {
      documents: documentCounts,
      totalChunks: chunkRows[0]?.count ?? 0,
      conversations: conversationRows[0]?.count ?? 0,
      messagesLast7Days: messageRows[0]?.count ?? 0,
      feedback: ratings,
    };
    return NextResponse.json(payload);
  } catch (err) {
    return apiError(err);
  }
}
