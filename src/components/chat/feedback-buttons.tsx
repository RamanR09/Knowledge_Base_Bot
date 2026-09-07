"use client";

import * as React from "react";
import { Loader2Icon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ApiErrorResponse } from "./types";

type Rating = "up" | "down";

interface FeedbackButtonsProps {
  messageId: string;
}

async function postFeedback(
  messageId: string,
  rating: Rating,
  comment?: string,
): Promise<void> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messageId,
      rating,
      comment: comment && comment.trim().length > 0 ? comment.trim() : undefined,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error ?? "Failed to save feedback.");
  }
}

/** Thumbs up/down on completed assistant messages; down collects an optional comment. */
export function FeedbackButtons({ messageId }: FeedbackButtonsProps) {
  const [rating, setRating] = React.useState<Rating | null>(null);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleUp() {
    const previous = rating;
    setRating("up"); // optimistic
    try {
      await postFeedback(messageId, "up");
    } catch (err) {
      setRating(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save feedback.");
    }
  }

  async function handleDownSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const previous = rating;
    setRating("down"); // optimistic
    setSubmitting(true);
    try {
      await postFeedback(messageId, "down", comment);
      setPopoverOpen(false);
      setComment("");
    } catch (err) {
      setRating(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  const commentId = `feedback-comment-${messageId}`;

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Rate this answer">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Good answer"
        aria-pressed={rating === "up"}
        onClick={handleUp}
        className={cn(
          "text-muted-foreground",
          rating === "up" && "bg-muted text-foreground",
        )}
      >
        <ThumbsUpIcon aria-hidden />
      </Button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Bad answer"
              aria-pressed={rating === "down"}
              className={cn(
                "text-muted-foreground",
                rating === "down" && "bg-muted text-foreground",
              )}
            />
          }
        >
          <ThumbsDownIcon aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <form onSubmit={handleDownSubmit} className="flex flex-col gap-3">
            <Label htmlFor={commentId}>
              What was wrong?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={commentId}
              value={comment}
              maxLength={2000}
              rows={3}
              placeholder="Wrong document, missing detail, made something up…"
              onChange={(e) => setComment(e.target.value)}
              className="max-h-40"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPopoverOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? (
                  <Loader2Icon
                    aria-hidden
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                Send feedback
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
