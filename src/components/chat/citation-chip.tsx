"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatCitation } from "./types";

interface CitationChipProps {
  citation: ChatCitation;
  onOpen: (citation: ChatCitation) => void;
  className?: string;
}

function pageLabel(citation: ChatCitation): string | null {
  if (citation.startPage === null) return null;
  if (citation.endPage !== null && citation.endPage !== citation.startPage) {
    return `pp. ${citation.startPage}–${citation.endPage}`;
  }
  return `p. ${citation.startPage}`;
}

/** Numbered blue pill [n] — clicking opens the source viewer at the cited chunk. */
export function CitationChip({ citation, onOpen, className }: CitationChipProps) {
  const pages = pageLabel(citation);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Source ${citation.ordinal}: ${citation.documentTitle}`}
            onClick={() => onOpen(citation)}
            className={cn(
              "inline-flex h-5 min-w-6 items-center justify-center rounded-4xl border border-citation/30 bg-citation/10 px-1.5 font-mono text-xs font-medium text-citation transition-colors outline-none hover:bg-citation/20 focus-visible:ring-3 focus-visible:ring-citation/40",
              className,
            )}
          />
        }
      >
        [{citation.ordinal}]
      </TooltipTrigger>
      <TooltipContent>
        {citation.documentTitle || "Untitled document"}
        {pages ? ` · ${pages}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
