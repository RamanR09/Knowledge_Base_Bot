import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sha256, validateUpload } from "@/lib/ingestion/validate";

/** A minimal but real PDF header — enough for magic-byte sniffing. */
const PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);

const MARKDOWN_BUFFER = Buffer.from("# Deploy Guide\n\nRoll back within 30 minutes.\n", "utf8");

describe("validateUpload — magic bytes vs extension", () => {
  it("accepts a real PDF uploaded as .pdf", async () => {
    const result = await validateUpload(PDF_BUFFER, "guide.pdf", "application/pdf");
    expect(result).toEqual({ ok: true, kind: "pdf" });
  });

  it("accepts a real PDF with a generic browser MIME", async () => {
    const result = await validateUpload(PDF_BUFFER, "guide.pdf", "application/octet-stream");
    expect(result).toEqual({ ok: true, kind: "pdf" });
  });

  it("rejects a PDF renamed to .md (sniffed type inconsistent with a text extension)", async () => {
    const result = await validateUpload(PDF_BUFFER, "guide.md", "text/markdown");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/pdf/i);
  });

  it("rejects non-PDF bytes uploaded as .pdf", async () => {
    const result = await validateUpload(MARKDOWN_BUFFER, "fake.pdf", "application/pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not a valid PDF/i);
  });

  it("rejects a .docx whose content sniffs as another format", async () => {
    const result = await validateUpload(
      PDF_BUFFER,
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not a valid DOCX/i);
  });
});

describe("validateUpload — text kinds", () => {
  it("accepts markdown, txt, and csv when the sniff is undefined and there are no NUL bytes", async () => {
    await expect(validateUpload(MARKDOWN_BUFFER, "notes.md", "text/markdown")).resolves.toEqual({
      ok: true,
      kind: "md",
    });
    await expect(
      validateUpload(Buffer.from("plain text file\n"), "notes.txt", "text/plain"),
    ).resolves.toEqual({ ok: true, kind: "txt" });
    await expect(
      validateUpload(Buffer.from("name,seats\nStarter,5\n"), "plans.csv", "text/csv"),
    ).resolves.toEqual({ ok: true, kind: "csv" });
  });

  it("accepts .markdown as an alias for md", async () => {
    await expect(
      validateUpload(MARKDOWN_BUFFER, "notes.markdown", "text/markdown"),
    ).resolves.toEqual({ ok: true, kind: "md" });
  });

  it("rejects a .txt containing NUL bytes", async () => {
    const binary = Buffer.concat([Buffer.from("looks like text"), Buffer.from([0, 1, 2])]);
    const result = await validateUpload(binary, "sneaky.txt", "text/plain");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/binary/i);
  });
});

describe("validateUpload — size and extension gates", () => {
  it("rejects a file one byte over the 50MB cap", async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 97);
    const result = await validateUpload(oversized, "huge.txt", "text/plain");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/50MB/);
  });

  it("accepts a file exactly at the 50MB cap", async () => {
    const atCap = Buffer.alloc(MAX_UPLOAD_BYTES, 97);
    await expect(validateUpload(atCap, "big.txt", "text/plain")).resolves.toEqual({
      ok: true,
      kind: "txt",
    });
  });

  it("rejects an empty file", async () => {
    const result = await validateUpload(Buffer.alloc(0), "empty.txt", "text/plain");
    expect(result.ok).toBe(false);
  });

  it("rejects a disallowed extension (.exe)", async () => {
    const result = await validateUpload(Buffer.from("MZ fake binary"), "malware.exe", "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Unsupported file extension/i);
  });

  it("rejects a filename with no extension", async () => {
    const result = await validateUpload(Buffer.from("content"), "README", "text/plain");
    expect(result.ok).toBe(false);
  });

  it("rejects a claimed MIME inconsistent with the extension", async () => {
    const result = await validateUpload(PDF_BUFFER, "guide.pdf", "text/html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/MIME/i);
  });
});

describe("sha256", () => {
  it("matches the known digest of 'abc'", () => {
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable for identical content and different for different content", () => {
    expect(sha256(PDF_BUFFER)).toBe(sha256(Buffer.from(PDF_BUFFER)));
    expect(sha256(Buffer.from("a"))).not.toBe(sha256(Buffer.from("b")));
  });
});
