import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Phase 1 placeholder: streaming chat, citations, and history land in
// Phase 3 (`ChatMessageList`, `ChatInput`, `POST /api/notebooks/:id/chat`).
export function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <MessageSquare className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">No chat yet</p>
        <p className="max-w-64 text-xs text-muted-foreground">
          Add a source, then ask a question about it. Grounded, cited answers
          arrive in Phase 3.
        </p>
      </div>
      <form className="flex items-center gap-2 border-t p-3">
        <Input placeholder="Ask a question about this notebook…" disabled />
        <Button type="submit" disabled>
          Send
        </Button>
      </form>
    </div>
  );
}
