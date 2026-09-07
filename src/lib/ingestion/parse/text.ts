import type { ParsedBlock, ParsedDocument } from "../types";

/** Plain text → paragraph blocks split on blank lines. */
export function parseText(data: Buffer, title: string): ParsedDocument {
  const raw = data.toString("utf8").replace(/^﻿/, "");
  const blocks: ParsedBlock[] = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((text) => ({ type: "paragraph" as const, text }));
  return { title, blocks };
}
