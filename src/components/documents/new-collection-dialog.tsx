"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { ApiErrorResponse, CollectionDto } from "./types";

interface NewCollectionDialogProps {
  onCreated: (collection: CollectionDto) => void;
}

export function NewCollectionDialog({ onCreated }: NewCollectionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (res.status === 201) {
        const collection = (await res.json()) as CollectionDto;
        toast.success(`Collection “${collection.name}” created`);
        onCreated(collection);
        setOpen(false);
        setName("");
        setDescription("");
      } else {
        const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        setError(body?.error ?? "Failed to create the collection.");
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
        <PlusIcon aria-hidden />
        New collection
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>
            Group related documents so chat can search them together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={error ? "collection-error" : undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="collection-description"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error ? (
            <p id="collection-error" role="alert" className="text-sm text-status-failed">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting || name.trim().length === 0}>
              {submitting ? (
                <Loader2Icon
                  aria-hidden
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
