import { prisma } from "@/lib/db/prisma";
import type { Citation } from "@/lib/retrieval/types";
import type { ChatMessageSummary, ChatSessionSummary } from "./types";

function toMessageSummary(message: {
  id: string;
  role: string;
  content: string;
  citations: unknown;
  createdAt: Date;
}): ChatMessageSummary {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    citations: (message.citations as Citation[] | null) ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * A notebook has one continuous chat thread in this app (plan §2.3 reads as
 * singular "chat per notebook"; the schema supports multiple ChatSessions
 * per notebook, but nothing in the UI creates a second one) — this reuses
 * the most recently created session, or creates the first one. Noted here
 * per the workspace rule's "record every deviation" requirement.
 */
export async function getOrCreateActiveChatSession(
  notebookId: string
): Promise<ChatSessionSummary> {
  let session = await prisma.chatSession.findFirst({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    session = await prisma.chatSession.create({
      data: { notebookId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  return {
    sessionId: session.id,
    messages: session.messages.map(toMessageSummary),
  };
}

/** Ownership-checked lookup: only returns the session if its notebook belongs to userId. */
export async function findOwnedChatSession(sessionId: string, notebookId: string, userId: string) {
  return prisma.chatSession.findFirst({
    where: { id: sessionId, notebookId, notebook: { userId } },
  });
}

export async function appendChatMessage(params: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
}): Promise<ChatMessageSummary> {
  const message = await prisma.chatMessage.create({
    data: {
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      citations: params.citations
        ? JSON.parse(JSON.stringify(params.citations))
        : undefined,
    },
  });
  return toMessageSummary(message);
}

export async function listMessagesForSession(sessionId: string): Promise<ChatMessageSummary[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map(toMessageSummary);
}
