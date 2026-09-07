"use client";

import * as React from "react";
import {
  InboxIcon,
  Loader2Icon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, truncate } from "./format";
import { EmptyState, LoadError, TableSkeleton } from "./tab-states";
import type { AdminFeedbackDto, ApiErrorResponse } from "./types";
import { useAdminData } from "./use-admin-data";

function RatingIcon({ rating }: { rating: "up" | "down" }) {
  const Icon = rating === "up" ? ThumbsUpIcon : ThumbsDownIcon;
  return (
    <span
      className={
        rating === "up" ? "text-status-ready" : "text-status-failed"
      }
    >
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">
        {rating === "up" ? "Positive feedback" : "Negative feedback"}
      </span>
    </span>
  );
}

function PromoteButton({
  row,
  onChanged,
}: {
  row: AdminFeedbackDto;
  onChanged: () => void;
}) {
  const [promoting, setPromoting] = React.useState(false);

  async function handlePromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/admin/feedback/${row.id}/promote`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to promote feedback.");
      }
      toast.success("Case created — edit expected answer in evals");
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to promote feedback.",
      );
    } finally {
      setPromoting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={row.promotedToEvalCase || promoting}
      onClick={handlePromote}
    >
      {promoting ? (
        <Loader2Icon
          aria-hidden
          className="animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {row.promotedToEvalCase ? "Promoted" : "Promote to eval case"}
    </Button>
  );
}

export function FeedbackTab() {
  const { data, error, reload } = useAdminData<AdminFeedbackDto[]>(
    "/api/admin/feedback",
  );

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (data === null) return <TableSkeleton />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={InboxIcon}
        title="No feedback yet"
        description="Thumbs up/down ratings on chat answers will show up here for triage."
      />
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Rating</span>
            </TableHead>
            <TableHead>Comment</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-44 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <RatingIcon rating={row.rating} />
              </TableCell>
              <TableCell className="max-w-56">
                {row.comment ? (
                  row.comment.length > 64 ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="block truncate rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          />
                        }
                      >
                        {row.comment}
                      </TooltipTrigger>
                      <TooltipContent>
                        {truncate(row.comment, 400)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="block truncate">{row.comment}</span>
                  )
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="max-w-72">
                <div className="flex flex-col">
                  <span className="truncate text-muted-foreground">
                    {truncate(row.messagePreview, 96)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    in {row.conversationTitle}
                  </span>
                </div>
              </TableCell>
              <TableCell className="max-w-48">
                <span className="block truncate text-sm text-muted-foreground">
                  {row.userEmail}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(row.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end">
                  <PromoteButton row={row} onChanged={reload} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
