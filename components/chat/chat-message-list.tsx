"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageContent } from "./message-content";
import { SourcesUsedList } from "./sources-used-list";
import type { ChatUiMessage } from "./chat-panel";
import type { Citation } from "@/lib/retrieval/types";

function MessageBubble({
  message,
  onOpenCitation,
  onRetry,
}: {
  message: ChatUiMessage;
  onOpenCitation?: (citation: Citation) => void;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {message.status === "streaming" && message.content.length === 0 ? (
          <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        ) : (
          <MessageContent
            content={message.content}
            citations={message.citations}
            onOpenCitation={onOpenCitation}
          />
        )}

        {message.status === "verifying" && (
          <p className="mt-1 text-[11px] text-muted-foreground">Verifying sources…</p>
        )}

        {message.status !== "streaming" && !isUser && (
          <SourcesUsedList citations={message.citations} onOpenCitation={onOpenCitation} />
        )}

        {message.status === "error" && (
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-xs text-destructive">Something went wrong.</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={onRetry}
              >
                <RotateCcw className="size-3" /> Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatMessageList({
  messages,
  onOpenCitation,
  onRetry,
}: {
  messages: ChatUiMessage[];
  onOpenCitation?: (citation: Citation) => void;
  /** Re-sends the question that preceded a failed assistant message. */
  onRetry?: (questionText: string) => void;
}) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-3 p-3">
        {messages.map((message, index) => {
          const precedingUserMessage =
            message.role === "assistant" && message.status === "error"
              ? messages[index - 1]
              : undefined;
          const canRetry = onRetry && precedingUserMessage?.role === "user";

          return (
            <MessageBubble
              key={message.id}
              message={message}
              onOpenCitation={onOpenCitation}
              onRetry={canRetry ? () => onRetry(precedingUserMessage.content) : undefined}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
