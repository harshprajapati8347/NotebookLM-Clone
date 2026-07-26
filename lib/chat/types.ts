import type { Citation } from "@/lib/retrieval/types";

export interface ChatMessageSummary {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

export interface ChatSessionSummary {
  sessionId: string;
  messages: ChatMessageSummary[];
}
