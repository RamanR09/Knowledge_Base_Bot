import type { ParsedDocument } from "../types";
import { parseCsv } from "./csv";
import { parseDocx } from "./docx";
import { parseMarkdown } from "./markdown";
import { parsePdf } from "./pdf";
import { parseText } from "./text";

export type ParseKind = "pdf" | "md" | "txt" | "docx" | "csv";

/** "report.pdf" → "report"; falls back to the raw name. */
function titleFromFilename(filename: string): string {
  const stripped = filename.replace(/\.[^.]+$/, "").trim();
  return stripped || filename;
}

/** Dispatch a validated upload to the parser for its kind. */
export async function parseDocument(
  kind: ParseKind,
  data: Buffer,
  filename: string,
): Promise<ParsedDocument> {
  const title = titleFromFilename(filename);
  switch (kind) {
    case "pdf": {
      const { doc, needsOcr } = await parsePdf(data, title);
      if (needsOcr) {
        throw new Error(
          "Scanned PDF not yet supported: the file has almost no extractable text (needs OCR)",
        );
      }
      return doc;
    }
    case "md":
      return parseMarkdown(data.toString("utf8").replace(/^﻿/, ""), title);
    case "txt":
      return parseText(data, title);
    case "docx":
      return parseDocx(data, title);
    case "csv":
      return parseCsv(data, title);
  }
}
