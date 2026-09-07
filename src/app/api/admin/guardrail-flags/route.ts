import { NextResponse } from "next/server";
import { desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import type { GuardrailFlagDto } from "@/components/admin/types";
import { apiError } from "../../_helpers/errors";
import { requireAdmin } from "../_helpers/auth";

const RESULT_LIMIT = 100;
/** Not-null rows scanned before TS shape filtering (the jsonb shape varies). */
const SCAN_LIMIT = 500;
const CONTENT_MAX_CHARS = 4000;

/**
 * Loose parse of the guardrail_flags jsonb: { input: {...}, output: {...} }.
 * Shapes vary across prompt versions, so every field tolerates absence or
 * a different type via .optional().catch().
 */
const guardrailShape = z
  .object({
    input: z
      .object({
        blocked: z.boolean().optional().catch(undefined),
        categories: z.array(z.string()).optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
    output: z
      .object({
        secretLeak: z.boolean().optional().catch(undefined),
        uncited: z.boolean().optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

/** Summary labels for a flags payload; empty = nothing block/flag-worthy. */
function summarizeFlags(value: unknown): string[] {
  const parsed = guardrailShape.parse(value);
  const labels: string[] = [];
  const categories = parsed.input?.categories ?? [];
  if (parsed.input?.blocked) {
    if (categories.length > 0) {
      for (const category of categories) labels.push(`blocked: ${category}`);
    } else {
      labels.push("blocked input");
    }
  } else if (categories.length > 0) {
    for (const category of categories) labels.push(`input: ${category}`);
  }
  if (parsed.output?.secretLeak) labels.push("secret leak");
  if (parsed.output?.uncited) labels.push("uncited");
  return labels;
}

export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .select({
        messageId: messages.id,
        createdAt: messages.createdAt,
        role: messages.role,
        content: messages.content,
        guardrailFlags: messages.guardrailFlags,
        retrievalDebug: messages.retrievalDebug,
        conversationTitle: conversations.title,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(isNotNull(messages.guardrailFlags))
      .orderBy(desc(messages.createdAt))
      .limit(SCAN_LIMIT);

    const flagged: GuardrailFlagDto[] = [];
    for (const row of rows) {
      const flags = summarizeFlags(row.guardrailFlags);
      if (flags.length === 0) continue;
      flagged.push({
        messageId: row.messageId,
        createdAt: row.createdAt.toISOString(),
        conversationTitle: row.conversationTitle,
        role: row.role,
        flags,
        content: row.content.slice(0, CONTENT_MAX_CHARS),
        retrievalDebug: row.role === "assistant" ? row.retrievalDebug : null,
      });
      if (flagged.length >= RESULT_LIMIT) break;
    }
    return NextResponse.json(flagged);
  } catch (err) {
    return apiError(err);
  }
}
