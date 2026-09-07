"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/documents/status-badge";
import { formatDate, truncate } from "./format";
import { EmptyState, LoadError, TableSkeleton } from "./tab-states";
import type { ApiErrorResponse, IngestionHealthDto } from "./types";
import { useAdminData } from "./use-admin-data";

function RetryButton({
  doc,
  onChanged,
}: {
  doc: IngestionHealthDto;
  onChanged: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      if (!res.ok) throw new Error(body?.error ?? "Retry failed.");
      toast.success(`Retry queued for “${doc.title}”`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Retry ingestion of ${doc.title}`}
            disabled={retrying}
            onClick={handleRetry}
          />
        }
      >
        {retrying ? (
          <Loader2Icon
            aria-hidden
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <RotateCcwIcon aria-hidden />
        )}
      </TooltipTrigger>
      <TooltipContent>Retry ingestion</TooltipContent>
    </Tooltip>
  );
}

function DeleteButton({
  doc,
  onChanged,
}: {
  doc: IngestionHealthDto;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        throw new Error(body?.error ?? "Failed to delete the document.");
      }
      toast.success(`Deleted “${doc.title}”`);
      setOpen(false);
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete the document.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${doc.title}`}
          />
        }
      >
        <Trash2Icon aria-hidden className="text-muted-foreground" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>
            “{doc.title}” and all of its chunks will be permanently removed
            from the knowledge base.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? (
              <Loader2Icon
                aria-hidden
                className="animate-spin motion-reduce:animate-none"
              />
            ) : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function IngestionHealthTab() {
  const { data, error, reload } = useAdminData<IngestionHealthDto[]>(
    "/api/admin/ingestion-health",
  );
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (error) return <LoadError message={error} onRetry={reload} />;
  if (data === null) return <TableSkeleton />;
  if (data.length === 0) {
    return (
      <EmptyState
        icon={CircleCheckIcon}
        title="All clear"
        description="No failed or stuck ingestions — every document is processing normally or ready."
      />
    );
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Collection</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Error</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-20 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((doc) => {
            const expanded = expandedId === doc.id;
            return (
              <React.Fragment key={doc.id}>
                <TableRow>
                  <TableCell className="max-w-56">
                    <span className="block truncate font-medium">
                      {doc.title}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-40">
                    <span className="block truncate text-muted-foreground">
                      {doc.collectionName}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={doc.status} />
                      {doc.reason === "stuck" ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-status-processing"
                        >
                          stuck &gt;30 min
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {doc.stage ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {doc.progress !== null ? `${doc.progress}%` : "—"}
                  </TableCell>
                  <TableCell className="max-w-56">
                    {doc.error ? (
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                tabIndex={0}
                                className="truncate rounded-sm text-status-failed outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              />
                            }
                          >
                            {truncate(doc.error, 48)}
                          </TooltipTrigger>
                          <TooltipContent>
                            {truncate(doc.error, 300)}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} full error for ${doc.title}`}
                          onClick={() =>
                            setExpandedId(expanded ? null : doc.id)
                          }
                        >
                          <ChevronDownIcon
                            aria-hidden
                            className={cn(
                              "transition-transform motion-reduce:transition-none",
                              expanded && "rotate-180",
                            )}
                          />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {doc.status === "failed" ? (
                        <RetryButton doc={doc} onChanged={reload} />
                      ) : null}
                      <DeleteButton doc={doc} onChanged={reload} />
                    </div>
                  </TableCell>
                </TableRow>
                {expanded && doc.error ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="whitespace-normal">
                      <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-status-failed">
                        {doc.error}
                      </pre>
                    </TableCell>
                  </TableRow>
                ) : null}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
