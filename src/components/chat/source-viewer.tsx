"use client";

import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ApiErrorResponse, ChatCitation, ChunkDto } from "./types";

interface SourceViewerProps {
  /** Citation to show; null keeps the sheet closed. */
  citation: ChatCitation | null;
  onClose: () => void;
}

/** Highlights the cited span inside the chunk content via simple substring match. */
function HighlightedContent({
  content,
  citedText,
}: {
  content: string;
  citedText: string | null;
}) {
  const markRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    markRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [content, citedText]);

  const needle = citedText?.trim() ?? "";
  let index = -1;
  if (needle.length > 0) {
    index = content.indexOf(needle);
    if (index === -1) {
      index = content.toLowerCase().indexOf(needle.toLowerCase());
    }
  }
  if (index === -1) {
    return <>{content}</>;
  }
  return (
    <>
      {content.slice(0, index)}
      <mark
        ref={markRef}
        className="rounded-sm bg-citation/25 px-0.5 text-foreground"
      >
        {content.slice(index, index + needle.length)}
      </mark>
      {content.slice(index + needle.length)}
    </>
  );
}

function pageRange(chunk: ChunkDto): string | null {
  if (chunk.pageStart === null) return null;
  if (chunk.pageEnd !== null && chunk.pageEnd !== chunk.pageStart) {
    return `Pages ${chunk.pageStart}–${chunk.pageEnd}`;
  }
  return `Page ${chunk.pageStart}`;
}

interface LoadResult {
  chunkId: string;
  chunk: ChunkDto | null;
  error: string | null;
}

/** Side panel showing the cited chunk in context, fetched from GET /api/chunks/[id]. */
export function SourceViewer({ citation, onClose }: SourceViewerProps) {
  // Keyed by chunkId so a stale result for a previous citation is simply ignored.
  const [result, setResult] = React.useState<LoadResult | null>(null);

  const chunkId = citation?.chunkId ?? null;

  React.useEffect(() => {
    if (!chunkId) return;
    let cancelled = false;
    fetch(`/api/chunks/${chunkId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          throw new Error(body?.error ?? "Failed to load the source.");
        }
        return res.json() as Promise<ChunkDto>;
      })
      .then((data) => {
        if (!cancelled) setResult({ chunkId, chunk: data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({
            chunkId,
            chunk: null,
            error: err instanceof Error ? err.message : "Failed to load the source.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chunkId]);

  const chunk = result && result.chunkId === chunkId ? result.chunk : null;
  const error = result && result.chunkId === chunkId ? result.error : null;

  const pages = chunk ? pageRange(chunk) : null;

  return (
    <Sheet
      open={citation !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" aria-label="Source viewer">
        <SheetHeader className="pr-10">
          <SheetTitle>
            {chunk?.documentTitle ?? citation?.documentTitle ?? "Source"}
          </SheetTitle>
          <SheetDescription>
            {citation ? `Source ${citation.ordinal} — cited passage in context.` : ""}
          </SheetDescription>
          {chunk && chunk.headingPath.length > 0 ? (
            <nav aria-label="Section" className="text-xs text-muted-foreground">
              <ol className="flex flex-wrap items-center gap-1">
                {chunk.headingPath.map((heading, index) => (
                  <li key={index} className="flex items-center gap-1">
                    {index > 0 ? <span aria-hidden>›</span> : null}
                    <span>{heading}</span>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {pages ? (
              <span className="font-mono text-xs text-muted-foreground">{pages}</span>
            ) : null}
            {chunk?.sourceType === "url" && chunk.sourceUrl ? (
              <a
                href={chunk.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Open source page
                <ExternalLinkIcon aria-hidden className="size-3" />
              </a>
            ) : null}
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {error ? (
            <p role="alert" className="text-sm text-status-failed">
              {error}
            </p>
          ) : chunk ? (
            <p className="text-sm leading-6 whitespace-pre-wrap">
              <HighlightedContent
                content={chunk.content}
                citedText={citation?.citedText ?? null}
              />
            </p>
          ) : (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-10/12" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
