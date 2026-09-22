"use client";

import React, { useCallback, useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes, MAX_PDF_BYTES, validatePdfFile } from "@/lib/pdfFile";

interface PdfDropzoneProps {
  /** Called with the validated bytes once a real PDF has been accepted. */
  onFileAccepted: (bytes: Uint8Array, file: File) => void | Promise<void>;
  /** Called when the user clears the selection, so the page can reset state. */
  onCleared?: () => void;
  /** True while the page is running WASM verification on the accepted bytes. */
  processing?: boolean;
  /** Short status line shown under the zone by the parent page. */
  status?: string;
  disabled?: boolean;
}

/**
 * Drag-and-drop PDF picker used by the name, PAN and academic verify flows.
 *
 * The old UI was a bare file input whose status text read "Drop a PDF file
 * here" even though nothing handled a drop. This actually accepts drops,
 * validates before handing bytes to the WASM module, and shows the selected
 * file so the user can tell what they are about to prove.
 */
export default function PdfDropzone({
  onFileAccepted,
  onCleared,
  processing = false,
  status,
  disabled = false,
}: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selected, setSelected] = useState<File | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const locked = disabled || processing;

  const accept = useCallback(
    async (file: File) => {
      setRejection(null);
      const result = await validatePdfFile(file);

      if (!result.ok) {
        setSelected(null);
        setRejection(result.reason);
        onCleared?.();
        return;
      }

      setSelected(file);
      await onFileAccepted(result.bytes, file);
    },
    [onFileAccepted, onCleared]
  );

  const clear = useCallback(() => {
    setSelected(null);
    setRejection(null);
    if (inputRef.current) inputRef.current.value = "";
    onCleared?.();
  }, [onCleared]);

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (locked) return;

      const file = event.dataTransfer.files?.[0];
      if (file) await accept(file);
    },
    [accept, locked]
  );

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // Without preventDefault the browser navigates to the dropped file.
      event.preventDefault();
      if (!locked) setIsDragging(true);
    },
    [locked]
  );

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-label="Upload a DigiLocker-issued PDF"
        onClick={() => !locked && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (locked) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-slate-50/60 dark:bg-slate-800/40",
          locked
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/60 hover:bg-primary/5"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {processing ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Upload className="h-5 w-5 text-primary" />
          )}
        </div>

        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            {processing
              ? "Verifying document…"
              : isDragging
              ? "Drop the PDF to verify it"
              : "Drag a PDF here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            Signed PDF from DigiLocker · max {formatBytes(MAX_PDF_BYTES)} · never
            leaves your browser
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={locked}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) await accept(file);
          }}
        />
      </div>

      {selected && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-white/70 px-3 py-2 dark:bg-slate-900/70">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm font-medium" title={selected.name}>
              {selected.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatBytes(selected.size)}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={processing}
            aria-label="Remove selected file"
            onClick={(event) => {
              event.stopPropagation();
              clear();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {rejection && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {rejection}
        </p>
      )}

      {status && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-700" />
          )}
          <span className="text-sm font-medium text-muted-foreground">
            {status}
          </span>
        </div>
      )}
    </div>
  );
}
