"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ApiErrorResponse,
  CollectionOption,
  ConversationDto,
} from "./types";

export const ALL_COLLECTIONS = "all";

/** POST /api/conversations, returning the created row. */
export async function createConversation(
  collectionId: string | null,
): Promise<ConversationDto> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collectionId }),
  });
  if (res.status !== 201) {
    const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error ?? "Failed to start a new chat.");
  }
  return (await res.json()) as ConversationDto;
}

/** Collection scope select — "all" sentinel means null (search all collections). */
export function CollectionScopeSelect({
  collections,
  value,
  onChange,
  disabled,
}: {
  collections: CollectionOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const items = [
    { value: ALL_COLLECTIONS, label: "All collections" },
    ...collections.map((collection) => ({
      value: collection.id,
      label: collection.name,
    })),
  ];
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        className="max-w-56"
        aria-label="Collection scope for new chats"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Empty-state panel: pick an optional collection scope and start the first chat. */
export function NewChatPanel({ collections }: { collections: CollectionOption[] }) {
  const router = useRouter();
  const [scope, setScope] = React.useState<string>(ALL_COLLECTIONS);
  const [creating, setCreating] = React.useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const conversation = await createConversation(
        scope === ALL_COLLECTIONS ? null : scope,
      );
      router.push(`/chat/${conversation.id}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start a new chat.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {collections.length > 0 ? (
        <CollectionScopeSelect
          collections={collections}
          value={scope}
          onChange={setScope}
          disabled={creating}
        />
      ) : null}
      <Button onClick={handleCreate} disabled={creating}>
        {creating ? (
          <Loader2Icon
            aria-hidden
            className="animate-spin motion-reduce:animate-none"
          />
        ) : (
          <PlusIcon aria-hidden />
        )}
        New chat
      </Button>
    </div>
  );
}
