import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import {
  getConversationWithMessages,
  listConversations,
} from "@/app/api/_helpers/conversations";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Chat" };

const idSchema = z.uuid();

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { conversationId } = await params;
  if (!idSchema.safeParse(conversationId).success) notFound();

  const detail = await getConversationWithMessages(conversationId, user.id);
  if (!detail) notFound();

  const [conversations, collectionOptions] = await Promise.all([
    listConversations(user.id),
    db
      .select({ id: collections.id, name: collections.name })
      .from(collections)
      .orderBy(asc(collections.name)),
  ]);

  return (
    <ChatView
      key={conversationId}
      conversation={{
        id: detail.id,
        title: detail.title,
        collectionId: detail.collectionId,
        updatedAt: detail.updatedAt,
      }}
      conversations={conversations}
      collections={collectionOptions}
      initialMessages={detail.messages}
    />
  );
}
