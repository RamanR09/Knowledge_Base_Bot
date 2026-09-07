import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";

export type UploadKind = "pdf" | "md" | "txt" | "docx" | "csv";

export type ValidateUploadResult =
  | { ok: true; kind: UploadKind }
  | { ok: false; reason: string };

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Extensions we accept, mapped to their canonical kind. */
const EXTENSION_KINDS: Record<string, UploadKind> = {
  pdf: "pdf",
  md: "md",
  markdown: "md",
  txt: "txt",
  docx: "docx",
  csv: "csv",
};

/** Kinds that are plain text — magic-byte sniffing returns `undefined` for these. */
const TEXT_KINDS: ReadonlySet<UploadKind> = new Set(["md", "txt", "csv"]);

/** Claimed MIME types considered consistent with each kind. */
const ALLOWED_MIMES: Record<UploadKind, readonly string[]> = {
  pdf: ["application/pdf"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
  txt: ["text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
};

/** Browsers sometimes send no/generic MIME; the magic bytes are the real gate. */
const GENERIC_MIMES: ReadonlySet<string> = new Set(["", "application/octet-stream"]);

function hasNulBytes(data: Buffer): boolean {
  const window = data.subarray(0, 8 * 1024);
  return window.includes(0);
}

/**
 * Validate an uploaded file: size cap, extension allowlist, claimed-MIME
 * consistency, and magic-byte sniff consistency (binary kinds must sniff as
 * themselves; text kinds must NOT sniff as any binary format and must not
 * contain NUL bytes in the first 8KB).
 *
 * Async because `file-type` sniffing is async.
 */
export async function validateUpload(
  data: Buffer,
  filename: string,
  mimeType: string,
): Promise<ValidateUploadResult> {
  if (data.length === 0) {
    return { ok: false, reason: "File is empty" };
  }
  if (data.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `File is ${(data.length / (1024 * 1024)).toFixed(1)}MB — the limit is 50MB`,
    };
  }

  const extMatch = /\.([A-Za-z0-9]+)$/.exec(filename);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";
  const kind = EXTENSION_KINDS[ext];
  if (!kind) {
    return {
      ok: false,
      reason: `Unsupported file extension ".${ext}" — allowed: pdf, md, txt, docx, csv`,
    };
  }

  const claimedMime = mimeType.toLowerCase().split(";")[0].trim();
  if (!GENERIC_MIMES.has(claimedMime) && !ALLOWED_MIMES[kind].includes(claimedMime)) {
    return {
      ok: false,
      reason: `MIME type "${claimedMime}" is inconsistent with a .${ext} file`,
    };
  }

  const detected = await fileTypeFromBuffer(data);

  if (TEXT_KINDS.has(kind)) {
    // Plain-text formats have no magic bytes; a positive detection means the
    // content is actually some binary format wearing a text extension.
    if (detected) {
      return {
        ok: false,
        reason: `File content looks like ${detected.ext} (${detected.mime}), not ${kind}`,
      };
    }
    if (hasNulBytes(data)) {
      return { ok: false, reason: `File contains binary data but claims to be ${kind}` };
    }
    return { ok: true, kind };
  }

  if (kind === "pdf") {
    if (detected?.ext !== "pdf") {
      return { ok: false, reason: "File content is not a valid PDF" };
    }
    return { ok: true, kind };
  }

  // docx
  if (detected?.ext !== "docx") {
    return { ok: false, reason: "File content is not a valid DOCX document" };
  }
  return { ok: true, kind };
}

/** Hex SHA-256 of a buffer — used as the dedupe content hash. */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
