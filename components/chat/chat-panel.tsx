"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import { ChatInput } from "./chat-input";
import { ChatMessageList } from "./chat-message-list";
import type { ChatMessageSummary } from "@/lib/chat/types";
import type { Citation } from "@/lib/retrieval/types";

export interface ChatUiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  status: "done" | "streaming" | "verifying" | "error";
}

function toUiMessage(message: ChatMessageSummary): ChatUiMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations ?? [],
    status: "done",
  };
}

/** Center panel: chat history, streamed answers, inline citations (plan §8.1/§2.3). */
export function ChatPanel({
  notebookId,
  initialSessionId,
  initialMessages,
  onOpenCitation,
}: {
  notebookId: string;
  initialSessionId: string;
  initialMessages: ChatMessageSummary[];
  onOpenCitation?: (citation: Citation) => void;
}) {
  const [sessionId, setSessionId] = React.useState(initialSessionId);
  const [messages, setMessages] = React.useState<ChatUiMessage[]>(
    initialMessages.map(toUiMessage)
  );
  const [busy, setBusy] = React.useState(false);

  function updateAssistantMessage(id: string, updater: (msg: ChatUiMessage) => ChatUiMessage) {
    setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  }

  async function handleSend(text: string) {
    const userMessage: ChatUiMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: text,
      citations: [],
      status: "done",
    };
    const assistantId = `local-assistant-${Date.now()}`;
    const assistantPlaceholder: ChatUiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      citations: [],
      status: "streaming",
    };
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setBusy(true);

    try {
      const response = await fetch(`/api/notebooks/${notebookId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send message");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.trim()) continue;

          const frame = JSON.parse(line) as
            | { type: "meta"; sessionId: string; userMessageId: string }
            | { type: "delta"; text: string }
            | { type: "final"; messageId: string; citations: Citation[] }
            | { type: "error"; message: string };

          if (frame.type === "meta") {
            setSessionId(frame.sessionId);
          } else if (frame.type === "delta") {
            updateAssistantMessage(assistantId, (m) => ({
              ...m,
              content: m.content + frame.text,
            }));
          } else if (frame.type === "final") {
            updateAssistantMessage(assistantId, (m) => ({
              ...m,
              id: frame.messageId,
              citations: frame.citations,
              status: "done",
            }));
          } else if (frame.type === "error") {
            updateAssistantMessage(assistantId, (m) => ({
              ...m,
              content: frame.message,
              status: "error",
            }));
          }
        }
      }
    } catch (error) {
      updateAssistantMessage(assistantId, (m) => ({
        ...m,
        content: error instanceof Error ? error.message : "Something went wrong.",
        status: "error",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col md:border-r">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <MessageSquare className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No chat yet</p>
          <p className="max-w-64 text-xs text-muted-foreground">
            Add a source, then ask a question about it. Answers are grounded in
            your sources with numbered citations.
          </p>
        </div>
      ) : (
        <ChatMessageList
          messages={messages}
          onOpenCitation={onOpenCitation}
          onRetry={busy ? undefined : handleSend}
        />
      )}
      <ChatInput disabled={busy} onSend={handleSend} />
    </div>
  );
}
