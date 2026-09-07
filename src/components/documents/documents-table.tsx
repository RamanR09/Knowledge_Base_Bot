"use client";

import * as React from "react";
import {
  FileTextIcon,
  GlobeIcon,
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { StatusBadge } from "./status-badge";
import type { ApiErrorResponse, DocumentDto } from "./types";

interface DocumentsTableProps {
  /** null while the first load is in flight. */
  documents: DocumentDto[] | null;
  /** Called after a retry/delete so the parent can refresh. */
  onChanged: () => void;
}

/** Provider rate-limit failures get a distinct, reassuring presentation. */
function isRateLimited(doc: DocumentDto): boolean {
  return (
    doc.status === "failed" &&
    typeof doc.error === "string" &&
    /^RATE_LIMITED:|status code:\s*429|rate.?limit/i.test(doc.error)
  );
}

function rateLimitTooltip(error: string): string {
  return error.startsWith("RATE_LIMITED:")
    ? error.slice("RATE_LIMITED:".length).trim()
    : "The embedding provider rate-limited this document (Voyage free tier without a payment method = 3 requests/min). Retry in a minute, or add a payment method at dashboard.voyageai.com to lift the cap — free tokens still apply.";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function pagesAndChunks(doc: DocumentDto): string {
  const parts: string[] = [];
  if (doc.pageCount !== null) {
    parts.push(`${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"}`);
  }
  if (doc.chunkCount !== null && doc.chunkCount > 0) {
    parts.push(`${doc.chunkCount} ${doc.chunkCount === 1 ? "chunk" : "chunks"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function SourceTypeIcon({ doc }: { doc: DocumentDto }) {
  const isUrl = doc.sourceType === "url";
  const Icon = isUrl ? GlobeIcon : FileTextIcon;
  return (
    <span className="inline-flex items-center text-muted-foreground">
      <Icon aria-hidden className="size-4" />
      <span className="sr-only">{isUrl ? "Web page" : "Uploaded file"}</span>
    </span>
  );
}

function RetryButton({
  doc,
  onChanged,
}: {
  doc: DocumentDto;
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
      if (!res.ok) {
        throw new Error(body?.error ?? "Retry failed.");
      }
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

function DeleteDocumentButton({
  doc,
  onChanged,
}: {
  doc: DocumentDto;
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
            “{doc.title}” and all of its chunks will be permanently removed from
            the knowledge base.
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

export function DocumentsTable({ documents, onChanged }: DocumentsTableProps) {
  return (
    <div className="rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Source type</span>
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-20 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents === null ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : documents.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                No documents yet — drop a file above or add a URL to get started.
              </TableCell>
            </TableRow>
          ) : (
            documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <SourceTypeIcon doc={doc} />
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="flex flex-col">
                    <span className="truncate font-medium">{doc.title}</span>
                    {doc.sourceUrl ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {doc.sourceUrl}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  {doc.status === "failed" && doc.error ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="inline-flex rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                          />
                        }
                      >
                        <StatusBadge
                          status={doc.status}
                          rateLimited={isRateLimited(doc)}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72">
                        {isRateLimited(doc)
                          ? rateLimitTooltip(doc.error)
                          : doc.error}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <StatusBadge status={doc.status} />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {pagesAndChunks(doc)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(doc.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {doc.status === "failed" ? (
                      <RetryButton doc={doc} onChanged={onChanged} />
                    ) : null}
                    <DeleteDocumentButton doc={doc} onChanged={onChanged} />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
