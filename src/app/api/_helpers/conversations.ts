import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  documents,
  messageCitations,
  messages,
} from "@/db/schema";

/** Serialized conversation summary (dates as ISO strings for props/JSON). */
export interface ConversationSummary {
  id: string;
  title: string;
  collectionId: string | null;
  updatedAt: string;
}

export interface CitationRecord {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  citedText: string | null;
  startPage: number | null;
  endPage: number | null;
  ordinal: number;
}

export interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  guardrailFlags: unknown;
  citations: CitationRecord[];
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageRecord[];
}

/** The current user's conversations, most recently updated first. */
export async function listConversations(
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      collectionId: conversations.collectionId,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

/**
 * One conversation with its messages (ascending) and their citations.
 * Returns null when the conversation doesn't exist or isn't owned by userId.
 */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string,
): Promise<ConversationDetail | null> {
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation || conversation.userId !== userId) return null;

  const messageRows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      guardrailFlags: messages.guardrailFlags,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const citationsByMessage = new Map<string, CitationRecord[]>();
  const ids = messageRows.map((row) => row.id);
  if (ids.length > 0) {
    const citationRows = await db
      .select({
        messageId: messageCitations.messageId,
        chunkId: messageCitations.chunkId,
        documentId: messageCitations.documentId,
        citedText: messageCitations.citedText,
        startPage: messageCitations.startPage,
        endPage: messageCitations.endPage,
        ordinal: messageCitations.ordinal,
        documentTitle: documents.title,
      })
      .from(messageCitations)
      .innerJoin(documents, eq(messageCitations.documentId, documents.id))
      .where(inArray(messageCitations.messageId, ids))
      .orderBy(asc(messageCitations.ordinal));
    for (const row of citationRows) {
      const list = citationsByMessage.get(row.messageId) ?? [];
      list.push({
        chunkId: row.chunkId,
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        citedText: row.citedText,
        startPage: row.startPage,
        endPage: row.endPage,
        ordinal: row.ordinal,
      });
      citationsByMessage.set(row.messageId, list);
    }
  }

  return {
    id: conversation.id,
    title: conversation.title,
    collectionId: conversation.collectionId,
    updatedAt: conversation.updatedAt.toISOString(),
    messages: messageRows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      guardrailFlags: row.guardrailFlags,
      citations: citationsByMessage.get(row.id) ?? [],
    })),
  };
}
