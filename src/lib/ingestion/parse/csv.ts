import Papa from "papaparse";
import type { ParsedBlock, ParsedDocument } from "../types";

/** Rows per table block; each block repeats the header so chunks self-describe. */
const ROWS_PER_BLOCK = 20;

/** CSV → table blocks of ~20 rows, each prefixed with the header line. */
export function parseCsv(data: Buffer, title: string): ParsedDocument {
  const raw = data.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: "greedy" });
  const rows = parsed.data.filter((r) => r.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) {
    throw new Error("CSV file contains no rows");
  }

  const [header, ...body] = rows;
  const blocks: ParsedBlock[] = [];
  if (body.length === 0) {
    blocks.push({ type: "table", text: Papa.unparse([header]) });
  } else {
    for (let i = 0; i < body.length; i += ROWS_PER_BLOCK) {
      const group = body.slice(i, i + ROWS_PER_BLOCK);
      blocks.push({ type: "table", text: Papa.unparse([header, ...group]) });
    }
  }
  return { title, blocks };
}
