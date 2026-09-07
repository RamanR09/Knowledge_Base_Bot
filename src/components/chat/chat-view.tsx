"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, MessagesSquareIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { MessageBubble, type UiMessage } from "./message-bubble";
import { ALL_COLLECTIONS, CollectionScopeSelect } from "./new-chat-button";
import { SourceViewer } from "./source-viewer";
import {
  blockedCategoryOf,
  type ApiErrorResponse,
  type ChatCitation,
  type ChatMessageDto,
  type ChatSseEvent,
  type CollectionOption,
  type ConversationDetailDto,
  type ConversationDto,
} from "./types";

const MAX_QUESTION_CHARS = 4000;
const COUNTER_THRESHOLD = 3600;
const DEFAULT_TITLE = "New conversation";
const TITLE_MAX_CHARS = 60;

const SUGGESTED_QUESTIONS = [
  "What topics does this knowledge base cover?",
  "Summarize the key points from the most recent document.",
  "Which documents mention deadlines or important dates?",
];

interface ChatViewProps {
  conversation: ConversationDto;
  conversations: ConversationDto[];
  collections: CollectionOption[];
  initialMessages: ChatMessageDto[];
}

function toUiMessage(dto: ChatMessageDto): UiMessage {
  return {
    localId: `loaded-${dto.id}`,
    id: dto.id,
    role: dto.role,
    content: dto.content,
    citations: dto.citations,
    blockedCategory:
      dto.role === "assistant" ? blockedCategoryOf(dto.guardrailFlags) : null,
    streaming: false,
    failed: false,
    stopped: false,
    question: null,
  };
}

export function ChatView({
  conversation,
  conversations,
  collections,
  initialMessages,
}: ChatViewProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<UiMessage[]>(() =>
    initialMessages.map(toUiMessage),
  );
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [title, setTitle] = React.useState(conversation.title);
  const [scope, setScope] = React.useState<string>(
    conversation.collectionId ?? ALL_COLLECTIONS,
  );
  const [viewerCitation, setViewerCitation] = React.useState<ChatCitation | null>(
    null,
  );
  const abortRef = React.useRef<AbortController | null>(null);
  const localIdRef = React.useRef(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = React.useRef(true);

  // Auto-scroll on new content unless the user has scrolled up.
  React.useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Abort any in-flight stream when leaving the conversation.
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  /** Replace stream-time citation stubs with the persisted records (adds citedText). */
  async function hydrateCitations(messageId: string, localId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`);
      if (!res.ok) return;
      const detail = (await res.json()) as ConversationDetailDto;
      const persisted = detail.messages.find((m) => m.id === messageId);
      if (!persisted || persisted.citations.length === 0) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.localId === localId ? { ...m, citations: persisted.citations } : m,
        ),
      );
    } catch {
      // Non-fatal: chips keep working without citedText highlighting.
    }
  }

  async function send(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (streaming || question.length === 0 || question.length > MAX_QUESTION_CHARS) {
      return;
    }
    setInput("");
    stickToBottomRef.current = true;

    const userLocalId = `local-${localIdRef.current++}`;
    const assistantLocalId = `local-${localIdRef.current++}`;
    const base = {
      id: null,
      citations: [] as ChatCitation[],
      blockedCategory: null,
      failed: false,
      stopped: false,
    };
    setMessages((prev) => [
      ...prev,
      {
        ...base,
        localId: userLocalId,
        role: "user",
        content: question,
        streaming: false,
        question: null,
      },
      {
        ...base,
        localId: assistantLocalId,
        role: "assistant",
        content: "",
        streaming: true,
        question,
      },
    ]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const update = (updater: (m: UiMessage) => UiMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.localId === assistantLocalId ? updater(m) : m)),
      );
    };

    let sawTerminal = false;
    const handleEvent = (event: ChatSseEvent) => {
      switch (event.type) {
        case "text": {
          const { delta } = event;
          update((m) => ({ ...m, content: m.content + delta }));
          break;
        }
        case "citation": {
          const citation: ChatCitation = {
            ordinal: event.ordinal,
            chunkId: event.chunkId,
            documentId: event.documentId,
            documentTitle: event.documentTitle,
            citedText: null,
            startPage: event.page,
            endPage: null,
          };
          update((m) => ({
            ...m,
            citations: [
              ...m.citations.filter((c) => c.ordinal !== citation.ordinal),
              citation,
            ],
          }));
          break;
        }
        case "guardrail_blocked": {
          const { category } = event;
          update((m) => ({ ...m, blockedCategory: category }));
          break;
        }
        case "done": {
          sawTerminal = true;
          const { messageId } = event;
          update((m) => ({ ...m, id: messageId, streaming: false }));
          if (title === DEFAULT_TITLE) {
            setTitle(question.slice(0, TITLE_MAX_CHARS));
          }
          void hydrateCitations(messageId, assistantLocalId);
          router.refresh();
          break;
        }
        case "error": {
          sawTerminal = true;
          toast.error(event.message);
          update((m) => ({ ...m, streaming: false, failed: true }));
          break;
        }
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, question }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status}).`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let separator: number;
        while ((separator = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              handleEvent(JSON.parse(line.slice(6)) as ChatSseEvent);
            } catch {
              // Skip malformed frames.
            }
          }
        }
      }
      if (!sawTerminal) {
        update((m) => ({ ...m, streaming: false, failed: true }));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        update((m) => ({ ...m, streaming: false, stopped: true }));
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to send the message.",
        );
        update((m) => ({ ...m, streaming: false, failed: true }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  /** Re-send the same question after a failed stream. */
  function handleRetry(message: UiMessage) {
    const question = message.question;
    if (!question || streaming) return;
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.localId === message.localId);
      if (index === -1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      const previous = next[index - 1];
      if (previous?.role === "user" && previous.content === question) {
        next.splice(index - 1, 1);
      }
      return next;
    });
    void send(question);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!streaming) void send(input);
    }
  }

  const storedScopeName = conversation.collectionId
    ? (collections.find((c) => c.id === conversation.collectionId)?.name ??
      "Collection")
    : "All collections";

  return (
    <div className="flex h-svh min-h-0 flex-1 overflow-hidden">
      <ConversationList
        conversations={conversations}
        activeId={conversation.id}
        newChatCollectionId={scope === ALL_COLLECTIONS ? null : scope}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
            Searching: {storedScopeName}
          </span>
        </header>
        <div
          ref={listRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Messages"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <MessagesSquareIcon
                    aria-hidden
                    className="size-6 text-muted-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">Ask your knowledge base</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Answers are grounded in your documents and always cite their
                    sources.
                  </p>
                </div>
                <div className="flex w-full max-w-md flex-col gap-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <Button
                      key={question}
                      variant="outline"
                      className="justify-start text-left font-normal whitespace-normal"
                      onClick={() => void send(question)}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.localId}
                  message={message}
                  onOpenCitation={setViewerCitation}
                  onRetry={handleRetry}
                />
              ))
            )}
          </div>
        </div>
        <div className="border-t p-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  New chats search:
                </span>
                <CollectionScopeSelect
                  collections={collections}
                  value={scope}
                  onChange={setScope}
                />
              </div>
              {input.length >= COUNTER_THRESHOLD ? (
                <span
                  aria-live="polite"
                  className={cn(
                    "font-mono text-xs",
                    input.length >= MAX_QUESTION_CHARS
                      ? "text-status-failed"
                      : "text-status-processing",
                  )}
                >
                  {input.length}/{MAX_QUESTION_CHARS}
                </span>
              ) : null}
            </div>
            <div className="flex items-end gap-2">
              <label htmlFor="chat-input" className="sr-only">
                Ask a question
              </label>
              <Textarea
                id="chat-input"
                value={input}
                maxLength={MAX_QUESTION_CHARS}
                disabled={streaming}
                placeholder="Ask about your knowledge base… (Enter to send, Shift+Enter for a new line)"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="max-h-48 min-h-10 flex-1"
              />
              {streaming ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Stop generating"
                  onClick={() => abortRef.current?.abort()}
                >
                  <SquareIcon aria-hidden />
                </Button>
              ) : (
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={input.trim().length === 0}
                  onClick={() => void send(input)}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      <SourceViewer
        citation={viewerCitation}
        onClose={() => setViewerCitation(null)}
      />
    </div>
  );
}
