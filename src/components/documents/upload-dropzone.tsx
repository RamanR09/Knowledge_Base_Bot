"use client";

import * as React from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ApiErrorResponse, EnqueueResponse } from "./types";

const ACCEPT = ".pdf,.md,.txt,.docx,.csv";
const ALLOWED_EXTENSIONS = ["pdf", "md", "txt", "docx", "csv"];
const MAX_BYTES = 50 * 1024 * 1024;

interface UploadDropzoneProps {
  collectionId: string;
  /** Called after an upload batch finishes so the parent can refresh. */
  onUploaded: () => void;
}

export function UploadDropzone({ collectionId, onUploaded }: UploadDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [uploadingName, setUploadingName] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);

  function validate(file: File): string | null {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `${file.name}: unsupported type — allowed: PDF, MD, TXT, DOCX, CSV.`;
    }
    if (file.size > MAX_BYTES) {
      return `${file.name}: exceeds the 50MB limit.`;
    }
    return null;
  }

  async function uploadFile(file: File): Promise<string | null> {
    const form = new FormData();
    form.append("file", file);
    form.append("collectionId", collectionId);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (res.status === 202) {
      const body = (await res.json()) as EnqueueResponse;
      if (body.queued) {
        toast.success(`${file.name} queued for ingestion`);
      } else {
        toast.info(`${file.name} already exists in this collection`);
      }
      return null;
    }
    const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    return `${file.name}: ${body?.error ?? "upload failed."}`;
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const nextErrors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const problem = validate(file);
      if (problem) nextErrors.push(problem);
      else valid.push(file);
    }
    setErrors([...nextErrors]);
    for (const file of valid) {
      setUploadingName(file.name);
      try {
        const problem = await uploadFile(file);
        if (problem) nextErrors.push(problem);
      } catch {
        nextErrors.push(`${file.name}: network error while uploading.`);
      }
      setErrors([...nextErrors]);
    }
    setUploadingName(null);
    if (valid.length > 0) onUploaded();
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload documents: drag and drop files, or press Enter to browse"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors outline-none hover:border-ring/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          dragActive && "border-primary bg-muted/60",
        )}
      >
        {uploadingName ? (
          <Loader2Icon
            aria-hidden
            className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : (
          <UploadIcon aria-hidden className="size-6 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {uploadingName
            ? `Uploading ${uploadingName}…`
            : "Drag & drop files here, or click to browse"}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          PDF · MD · TXT · DOCX · CSV — up to 50MB each
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = "";
          void handleFiles(files);
        }}
      />
      {errors.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-status-failed">
          {errors.map((message, index) => (
            <li key={`${message}-${index}`}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
