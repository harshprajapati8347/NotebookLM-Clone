import { NextResponse } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/clerk";
import { findOwnedNotebook } from "@/lib/notebooks/queries";
import {
  appendChatMessage,
  findOwnedChatSession,
  getOrCreateActiveChatSession,
} from "@/lib/chat/queries";
import { retrieveChunks } from "@/lib/retrieval/retrieve";
import { rerankChunks } from "@/lib/retrieval/rerank";
import { attachSourceTitles, buildContextBlock, buildUserPrompt, SYSTEM_PROMPT } from "@/lib/retrieval/prompt";
import { validateCitations } from "@/lib/retrieval/citationValidate";
import { chatModel } from "@/lib/retrieval/generate";
import type { Citation } from "@/lib/retrieval/types";

type RouteParams = { params: Promise<{ id: string }> };

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message can't be empty").max(4000),
  sessionId: z.string().optional(),
});

const RETRIEVE_TOP_K = 20;
const RERANK_TOP_K = 6;
const NO_SOURCES_MESSAGE =
  "I couldn't find anything relevant in this notebook's sources to answer that. Try adding a source that covers this topic, or rephrase your question.";

const encoder = new TextEncoder();

function ndjson(obj: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(obj)}\n`);
}

export async function POST(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const notebook = await findOwnedNotebook(notebookId, userId);
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { message, sessionId: requestedSessionId } = parsed.data;

  let sessionId: string;
  if (requestedSessionId) {
    const session = await findOwnedChatSession(requestedSessionId, notebookId, userId);
    if (!session) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }
    sessionId = session.id;
  } else {
    const session = await getOrCreateActiveChatSession(notebookId);
    sessionId = session.sessionId;
  }

  const userMessage = await appendChatMessage({ sessionId, role: "user", content: message });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(ndjson({ type: "meta", sessionId, userMessageId: userMessage.id }));

      try {
        // [1] embed + [2] vector search, filtered by notebookId — plan §3.
        const retrieved = await retrieveChunks(notebookId, message, RETRIEVE_TOP_K);

        if (retrieved.length === 0) {
          const saved = await appendChatMessage({
            sessionId,
            role: "assistant",
            content: NO_SOURCES_MESSAGE,
            citations: null,
          });
          controller.enqueue(ndjson({ type: "delta", text: NO_SOURCES_MESSAGE }));
          controller.enqueue(
            ndjson({ type: "final", messageId: saved.id, citations: [] as Citation[] })
          );
          controller.close();
          return;
        }

        // [3] rerank down to the most relevant few.
        const reranked = await rerankChunks(message, retrieved, RERANK_TOP_K);
        const contextChunks = await attachSourceTitles(reranked);

        // [4] grounded prompt with numbered context chunks.
        const contextBlock = buildContextBlock(contextChunks);
        const userPrompt = buildUserPrompt(message, contextBlock);

        // [5] streamed generation with inline [n] citation markers.
        const result = streamText({
          model: chatModel,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
        });

        let fullText = "";
        for await (const delta of result.textStream) {
          fullText += delta;
          controller.enqueue(ndjson({ type: "delta", text: delta }));
        }

        // [6] citation validation — mandatory, never optional.
        const { cleanedText, citations } = validateCitations(fullText, contextChunks);

        const saved = await appendChatMessage({
          sessionId,
          role: "assistant",
          content: cleanedText,
          citations,
        });

        controller.enqueue(
          ndjson({ type: "final", messageId: saved.id, citations, cleanedText })
        );
        controller.close();
      } catch (error) {
        console.error(`[chat] [${sessionId}] generation failed:`, error);
        const message =
          "Something went wrong generating a response. Please try again.";
        await appendChatMessage({ sessionId, role: "assistant", content: message, citations: null });
        controller.enqueue(ndjson({ type: "error", message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
