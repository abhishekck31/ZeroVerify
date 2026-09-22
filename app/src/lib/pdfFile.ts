/**
 * Client-side validation for DigiLocker-issued PDF uploads.
 *
 * The verification pipeline hands raw bytes straight to the WASM module, which
 * is expensive and throws opaque panics on non-PDF input. Validating here keeps
 * bad files from ever reaching it and lets us show the user a real reason.
 */

/** Largest upload we accept. DigiLocker certificates are well under 1 MB. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Every PDF begins with these five bytes: "%PDF-" */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

export type PdfValidationResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: string };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Reads the file and confirms it is really a PDF.
 *
 * The file picker's `accept=".pdf"` only filters the dialog — it is trivially
 * bypassed by drag-and-drop or by renaming a file — so we check the magic
 * bytes rather than trusting the name or the browser-reported MIME type.
 */
export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }

  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      reason: `File is ${formatBytes(file.size)} — the limit is ${formatBytes(
        MAX_PDF_BYTES
      )}.`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: "Could not read that file from disk." };
  }

  const isPdf =
    bytes.length >= PDF_MAGIC.length &&
    PDF_MAGIC.every((byte, i) => bytes[i] === byte);

  if (!isPdf) {
    return {
      ok: false,
      reason: `"${file.name}" is not a PDF. Upload the signed PDF you downloaded from DigiLocker.`,
    };
  }

  return { ok: true, bytes };
}
