import { extractText } from "unpdf";
import type { ParsedBlock, ParsedDocument } from "../types";

/** Below this average chars/page the PDF is almost certainly scanned images. */
const MIN_CHARS_PER_PAGE = 50;

export interface PdfParseResult {
  doc: ParsedDocument;
  /**
   * True when the PDF has almost no extractable text (scanned/image-only).
   * OCR fallback is not implemented yet — the caller must surface a clear
   * "scanned PDF not yet supported" error.
   */
  needsOcr: boolean;
}

/** PDF → per-page paragraph blocks via unpdf (pdf.js). */
export async function parsePdf(data: Buffer, title: string): Promise<PdfParseResult> {
  const { totalPages, text } = await extractText(new Uint8Array(data), {
    mergePages: false,
  });

  const blocks: ParsedBlock[] = [];
  let totalChars = 0;
  text.forEach((pageText, i) => {
    totalChars += pageText.length;
    for (const para of pageText.split(/\n\s*\n/)) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      blocks.push({ type: "paragraph", text: trimmed, page: i + 1 });
    }
  });

  const needsOcr = totalPages > 0 && totalChars / totalPages < MIN_CHARS_PER_PAGE;
  return {
    doc: { title, blocks, pageCount: totalPages },
    needsOcr,
  };
}
