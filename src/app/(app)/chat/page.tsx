import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { MessagesSquareIcon } from "lucide-react";
import { db } from "@/db";
import { collections } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { listConversations } from "@/app/api/_helpers/conversations";
import { NewChatPanel } from "@/components/chat/new-chat-button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const conversations = await listConversations(user.id);
  if (conversations.length > 0) {
    redirect(`/chat/${conversations[0].id}`);
  }

  const collectionOptions = await db
    .select({ id: collections.id, name: collections.name })
    .from(collections)
    .orderBy(asc(collections.name));

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <MessagesSquareIcon aria-hidden className="size-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">Start your first chat</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Ask questions about your knowledge base and get answers with
              citations. Optionally scope the chat to one collection.
            </p>
          </div>
          <NewChatPanel collections={collectionOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
