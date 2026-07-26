import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/clerk";
import { findOwnedNotebook } from "@/lib/notebooks/queries";
import { findOwnedChatSession, listMessagesForSession } from "@/lib/chat/queries";

type RouteParams = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sessionId } = await params;
  const notebook = await findOwnedNotebook(notebookId, userId);
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const session = await findOwnedChatSession(sessionId, notebookId, userId);
  if (!session) {
    return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
  }

  const messages = await listMessagesForSession(sessionId);
  return NextResponse.json({ sessionId, messages });
}
