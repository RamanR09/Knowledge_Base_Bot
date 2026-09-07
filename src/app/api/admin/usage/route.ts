import { NextResponse } from "next/server";
import { gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages } from "@/db/schema";
import {
  PRICING_USD_PER_MTOK,
  type UsageDayDto,
} from "@/components/admin/types";
import { apiError } from "../../_helpers/errors";
import { requireAdmin } from "../_helpers/auth";

const WINDOW_DAYS = 30;

/**
 * Tolerant parse of the Anthropic usage jsonb — fields may be missing or
 * differently shaped across model versions, so each falls back to 0.
 */
const usageShape = z
  .object({
    input_tokens: z.number().nonnegative().catch(0),
    output_tokens: z.number().nonnegative().catch(0),
    cache_read_input_tokens: z.number().nonnegative().catch(0),
    cache_creation_input_tokens: z.number().nonnegative().catch(0),
  })
  .catch({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  });

function estimateCostUsd(day: Omit<UsageDayDto, "estimatedCostUsd">): number {
  return (
    (day.inputTokens * PRICING_USD_PER_MTOK.input +
      day.outputTokens * PRICING_USD_PER_MTOK.output +
      day.cacheReadTokens * PRICING_USD_PER_MTOK.cacheRead +
      day.cacheWriteTokens * PRICING_USD_PER_MTOK.cacheWrite) /
    1_000_000
  );
}

export async function GET() {
  try {
    await requireAdmin();
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({ createdAt: messages.createdAt, usage: messages.usage })
      .from(messages)
      .where(gte(messages.createdAt, since));

    const byDay = new Map<string, Omit<UsageDayDto, "estimatedCostUsd">>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const day = byDay.get(date) ?? {
        date,
        messages: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      const usage = usageShape.parse(row.usage);
      day.messages += 1;
      day.inputTokens += usage.input_tokens;
      day.outputTokens += usage.output_tokens;
      day.cacheReadTokens += usage.cache_read_input_tokens;
      day.cacheWriteTokens += usage.cache_creation_input_tokens;
      byDay.set(date, day);
    }

    const payload: UsageDayDto[] = [...byDay.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((day) => ({ ...day, estimatedCostUsd: estimateCostUsd(day) }));
    return NextResponse.json(payload);
  } catch (err) {
    return apiError(err);
  }
}
