import mammoth from "mammoth";
import type { ParsedBlock, ParsedDocument } from "../types";

/**
 * DOCX → blocks: mammoth converts to simple HTML (h1-h6/p/pre/ul/ol/table),
 * which we walk with a lightweight regex tokenizer — no HTML-parser
 * dependency. Known limitation: a list nested inside another list closes the
 * outer match early; the remaining items still surface as subsequent blocks.
 */
export async function parseDocx(data: Buffer, title: string): Promise<ParsedDocument> {
  const result = await mammoth.convertToHtml({ buffer: data });
  const blocks = htmlToBlocks(result.value);
  const firstH1 = blocks.find((b) => b.type === "heading" && b.headingLevel === 1);
  return { title: firstH1?.text ?? title, blocks };
}

const TOP_LEVEL_TAG_RE = /<(h[1-6]|p|pre|ul|ol|table)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const LIST_ITEM_RE = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi;
const TABLE_ROW_RE = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
const TABLE_CELL_RE = /<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi;

/** Exported for unit testing. */
export function htmlToBlocks(html: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const match of html.matchAll(TOP_LEVEL_TAG_RE)) {
    const tag = match[1].toLowerCase();
    const inner = match[2];

    if (tag.startsWith("h")) {
      const text = textOf(inner);
      if (text) blocks.push({ type: "heading", text, headingLevel: Number(tag[1]) });
    } else if (tag === "p") {
      const text = textOf(inner);
      if (text) blocks.push({ type: "paragraph", text });
    } else if (tag === "pre") {
      const text = textOf(inner);
      if (text) blocks.push({ type: "code", text });
    } else if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(LIST_ITEM_RE)]
        .map((m) => textOf(m[1]))
        .filter((t) => t.length > 0)
        .map((t) => `- ${t}`);
      if (items.length > 0) blocks.push({ type: "list", text: items.join("\n") });
    } else {
      // table
      const rows = [...inner.matchAll(TABLE_ROW_RE)]
        .map((row) =>
          [...row[1].matchAll(TABLE_CELL_RE)].map((cell) => textOf(cell[1])).join(" | "),
        )
        .filter((r) => r.replace(/\s*\|\s*/g, "").length > 0);
      if (rows.length > 0) blocks.push({ type: "table", text: rows.join("\n") });
    }
  }
  return blocks;
}

function textOf(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return decodeEntities(stripped).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (full, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? full);
}
