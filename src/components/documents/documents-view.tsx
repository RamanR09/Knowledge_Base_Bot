"use client";

import * as React from "react";
import { FolderOpenIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AddUrlDialog } from "./add-url-dialog";
import { DocumentsTable } from "./documents-table";
import { NewCollectionDialog } from "./new-collection-dialog";
import {
  TERMINAL_STATUSES,
  type CollectionDto,
  type DocumentDto,
} from "./types";
import { UploadDropzone } from "./upload-dropzone";

const POLL_INTERVAL_MS = 3000;

export function DocumentsView() {
  const [collections, setCollections] = React.useState<CollectionDto[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [documents, setDocuments] = React.useState<DocumentDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Promise-callback style keeps setState out of the effects' direct call path.
  const loadCollections = React.useCallback(() => {
    fetch("/api/collections")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CollectionDto[]>;
      })
      .then((data) => {
        setCollections(data);
        setSelectedId((previous) =>
          previous && data.some((c) => c.id === previous)
            ? previous
            : (data[0]?.id ?? null),
        );
      })
      .catch(() => {
        setCollections((previous) => previous ?? []);
        setLoadError("Failed to load collections.");
      });
  }, []);

  const loadDocuments = React.useCallback((collectionId: string, silent: boolean) => {
    fetch(`/api/documents?collectionId=${encodeURIComponent(collectionId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DocumentDto[]>;
      })
      .then((data) => {
        setDocuments(data);
        setLoadError(null);
      })
      .catch(() => {
        if (!silent) setLoadError("Failed to load documents.");
      });
  }, []);

  React.useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  React.useEffect(() => {
    if (selectedId) loadDocuments(selectedId, false);
  }, [selectedId, loadDocuments]);

  // Poll every 3s while any document is in a non-terminal status.
  React.useEffect(() => {
    if (!selectedId || !documents) return;
    const active = documents.some((doc) => !TERMINAL_STATUSES.has(doc.status));
    if (!active) return;
    const timer = setInterval(() => {
      loadDocuments(selectedId, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [documents, selectedId, loadDocuments]);

  const refresh = React.useCallback(() => {
    if (selectedId) loadDocuments(selectedId, true);
    loadCollections();
  }, [selectedId, loadDocuments, loadCollections]);

  const handleCollectionCreated = React.useCallback((collection: CollectionDto) => {
    setCollections((previous) => [...(previous ?? []), collection]);
    setDocuments(null);
    setSelectedId(collection.id);
  }, []);

  if (collections === null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FolderOpenIcon aria-hidden className="size-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Create your first collection</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Collections group related documents so chat can search them
              together.
            </p>
          </div>
          <NewCollectionDialog onCreated={handleCollectionCreated} />
          {loadError ? (
            <p role="alert" className="text-sm text-status-failed">
              {loadError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const collectionItems = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {selectedId ? (
          <Select
            items={collectionItems}
            value={selectedId}
            onValueChange={(value) => {
              if (typeof value === "string" && value !== selectedId) {
                setDocuments(null);
                setSelectedId(value);
              }
            }}
          >
            <SelectTrigger className="min-w-56" aria-label="Collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {collections.map((collection) => (
                <SelectItem key={collection.id} value={collection.id}>
                  {collection.name}
                  <span className="text-muted-foreground">
                    ({collection.documentCount})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <NewCollectionDialog onCreated={handleCollectionCreated} />
        {selectedId ? (
          <div className="ml-auto">
            <AddUrlDialog collectionId={selectedId} onQueued={refresh} />
          </div>
        ) : null}
      </div>
      {loadError ? (
        <p role="alert" className="text-sm text-status-failed">
          {loadError}
        </p>
      ) : null}
      {selectedId ? (
        <>
          <UploadDropzone collectionId={selectedId} onUploaded={refresh} />
          <DocumentsTable documents={documents} onChanged={refresh} />
        </>
      ) : null}
    </div>
  );
}
