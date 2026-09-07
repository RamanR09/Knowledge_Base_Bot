"use client";

import * as React from "react";
import { RotateCcwIcon, ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CitationChip } from "./citation-chip";
import { FeedbackButtons } from "./feedback-buttons";
import { MarkdownLite } from "./markdown-lite";
import type { ChatCitation } from "./types";

/** Client-side message model used by the chat view (streamed or loaded). */
export interface UiMessage {
  /** Stable client key. */
  localId: string;
  /** Server uuid once persisted; null while streaming or after a failure. */
  id: string | null;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  /** Guardrail category when the turn was blocked, else null. */
  blockedCategory: string | null;
  streaming: boolean;
  /** The stream failed — offer a retry of the same question. */
  failed: boolean;
  /** The user cancelled the stream. */
  stopped: boolean;
  /** Question that produced this assistant message (for retry). */
  question: string | null;
}

interface MessageBubbleProps {
  message: UiMessage;
  onOpenCitation: (citation: ChatCitation) => void;
  onRetry: (message: UiMessage) => void;
}

const REFUSAL_FALLBACK =
  "I can't help with that request. Please ask a question about the knowledge base.";

export function MessageBubble({
  message,
  onOpenCitation,
  onRetry,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl bg-primary/10 p-4 text-base leading-7 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.blockedCategory !== null) {
    return (
      <div className="flex">
        <div className="max-w-[70ch] rounded-xl border border-border bg-muted/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlertIcon aria-hidden className="size-4" />
            Blocked by guardrails
            <span className="rounded-4xl border border-border px-2 py-0.5 font-mono text-xs">
              {message.blockedCategory}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {message.content || REFUSAL_FALLBACK}
          </p>
        </div>
      </div>
    );
  }

  const citations = [...message.citations].sort((a, b) => a.ordinal - b.ordinal);
  const done = !message.streaming && !message.failed;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "max-w-[70ch] text-base leading-7",
          message.failed && "text-muted-foreground",
        )}
      >
        <MarkdownLite text={message.content} />
        {message.streaming ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse rounded-sm bg-foreground/60 motion-reduce:animate-none"
          />
        ) : null}
      </div>
      {message.failed ? (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-sm text-status-failed">
            The answer failed to generate.
          </p>
          <Button variant="outline" size="xs" onClick={() => onRetry(message)}>
            <RotateCcwIcon aria-hidden />
            Retry
          </Button>
        </div>
      ) : null}
      {message.stopped ? (
        <p className="text-xs text-muted-foreground">Stopped.</p>
      ) : null}
      {citations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sources:</span>
          {citations.map((citation) => (
            <CitationChip
              key={citation.ordinal}
              citation={citation}
              onOpen={onOpenCitation}
            />
          ))}
        </div>
      ) : null}
      {done && !message.stopped && message.id !== null ? (
        <FeedbackButtons messageId={message.id} />
      ) : null}
    </div>
  );
}
