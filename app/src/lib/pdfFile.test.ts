import { describe, expect, it } from "vitest";
import { formatBytes, MAX_PDF_BYTES, validatePdfFile } from "./pdfFile";

/** Builds a File whose bytes start with the given header. */
function fileWith(header: number[], name = "doc.pdf", padTo = 0): File {
  const bytes = new Uint8Array(Math.max(header.length, padTo));
  bytes.set(header);
  return new File([bytes], name, { type: "application/pdf" });
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("validatePdfFile", () => {
  it("accepts a real PDF and returns its bytes", async () => {
    const result = await validatePdfFile(fileWith(PDF_HEADER, "cert.pdf", 100));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.length).toBe(100);
  });

  it("rejects an empty file", async () => {
    const result = await validatePdfFile(new File([], "empty.pdf"));
    expect(result).toEqual({ ok: false, reason: "That file is empty." });
  });

  it("rejects anything past the size ceiling", async () => {
    // Report the size without allocating it.
    const big = new File([new Uint8Array(1)], "big.pdf");
    Object.defineProperty(big, "size", { value: MAX_PDF_BYTES + 1 });

    const result = await validatePdfFile(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("the limit is");
  });

  it("rejects a non-PDF even when it is named .pdf", async () => {
    // accept=".pdf" only filters the file dialog, so the bytes are what count.
    const disguised = fileWith([0x50, 0x4b, 0x03, 0x04], "payload.pdf", 64); // ZIP
    const result = await validatePdfFile(disguised);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("is not a PDF");
  });

  it("rejects a file too short to carry the signature", async () => {
    const result = await validatePdfFile(fileWith([0x25, 0x50], "tiny.pdf"));
    expect(result.ok).toBe(false);
  });
});
