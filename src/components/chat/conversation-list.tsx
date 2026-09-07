"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createConversation } from "./new-chat-button";
import type { ConversationDto } from "./types";

interface ConversationListProps {
  conversations: ConversationDto[];
  activeId: string;
  /** Scope applied when creating a new chat (from the composer-header select). */
  newChatCollectionId: string | null;
}

function DeleteConversationButton({
  conversation,
  isActive,
}: {
  conversation: ConversationDto;
  isActive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete the conversation.");
      setOpen(false);
      toast.success("Conversation deleted");
      if (isActive) router.push("/chat");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete the conversation.",
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
            size="icon-xs"
            aria-label={`Delete conversation “${conversation.title}”`}
            className="opacity-0 group-hover/conversation:opacity-100 focus-visible:opacity-100"
          />
        }
      >
        <Trash2Icon aria-hidden className="text-muted-foreground" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            “{conversation.title}” and all of its messages will be permanently
            removed.
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

/** Collapsible conversation rail inside the chat page (not the app sidebar). */
export function ConversationList({
  conversations,
  activeId,
  newChatCollectionId,
}: ConversationListProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  async function handleNewChat() {
    setCreating(true);
    try {
      const conversation = await createConversation(newChatCollectionId);
      router.push(`/chat/${conversation.id}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start a new chat.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Expand conversation list"
                aria-expanded={false}
                onClick={() => setCollapsed(false)}
              />
            }
          >
            <PanelLeftOpenIcon aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="right">Conversations</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New chat"
                disabled={creating}
                onClick={handleNewChat}
              />
            }
          >
            {creating ? (
              <Loader2Icon
                aria-hidden
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <PlusIcon aria-hidden />
            )}
          </TooltipTrigger>
          <TooltipContent side="right">New chat</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-1 border-b px-2 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse conversation list"
          aria-expanded
          onClick={() => setCollapsed(true)}
        >
          <PanelLeftCloseIcon aria-hidden />
        </Button>
        <span className="flex-1 truncate text-sm font-medium">Conversations</span>
        <Button
          variant="outline"
          size="sm"
          disabled={creating}
          onClick={handleNewChat}
        >
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
      <nav aria-label="Conversations" className="flex-1 overflow-y-auto p-2">
        <ul className="flex flex-col gap-1">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            return (
              <li
                key={conversation.id}
                className={cn(
                  "group/conversation flex items-center gap-1 rounded-lg pr-1 transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/70",
                )}
              >
                <Link
                  href={`/chat/${conversation.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {conversation.title}
                </Link>
                <DeleteConversationButton
                  conversation={conversation}
                  isActive={isActive}
                />
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
