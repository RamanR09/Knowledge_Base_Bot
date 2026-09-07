"use client";

import * as React from "react";
import { LinkIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiErrorResponse, EnqueueResponse } from "./types";

interface AddUrlDialogProps {
  collectionId: string;
  /** Called after a URL is queued so the parent can refresh. */
  onQueued: () => void;
}

export function AddUrlDialog({ collectionId, onQueued }: AddUrlDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [crawl, setCrawl] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/documents/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), collectionId, crawl }),
      });
      if (res.status === 202) {
        const body = (await res.json()) as EnqueueResponse;
        if (body.queued) {
          toast.success(crawl ? "Crawl queued for ingestion" : "URL queued for ingestion");
        } else {
          toast.info("Identical content already exists in this collection");
        }
        setOpen(false);
        setUrl("");
        setCrawl(false);
        onQueued();
      } else {
        const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        setError(body?.error ?? "Failed to queue the URL.");
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <LinkIcon aria-hidden />
        Add URL
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add URL</DialogTitle>
          <DialogDescription>
            Scrape a single page, or crawl a whole docs site into this collection.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-url">URL</Label>
            <Input
              id="add-url"
              type="url"
              required
              placeholder="https://docs.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-describedby={error ? "add-url-error" : undefined}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="crawl-site"
              checked={crawl}
              onCheckedChange={(checked) => setCrawl(checked)}
            />
            <Label htmlFor="crawl-site">Crawl entire site</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Crawling follows same-origin links and ingests each page as its own
            document.
          </p>
          {error ? (
            <p id="add-url-error" role="alert" className="text-sm text-status-failed">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting || url.trim().length === 0}>
              {submitting ? (
                <Loader2Icon
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              Queue ingestion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
