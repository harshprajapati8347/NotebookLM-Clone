"use client";

import * as React from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceViewerPanel } from "@/components/sources/source-viewer-panel";
import type { ChatMessageSummary } from "@/lib/chat/types";
import type { Citation } from "@/lib/retrieval/types";

/**
 * Owns the "which citation is currently open in the Source Viewer" state
 * shared between the chat panel (where citations are clicked) and the
 * source viewer panel (where they open) — plan Phase 4. Rendered as a
 * Fragment so `ChatPanel`/`SourceViewerPanel` stay direct children of the
 * workspace's 3-column CSS grid in `app/notebooks/[id]/page.tsx`.
 */
export function WorkspacePanels({
  notebookId,
  initialSessionId,
  initialMessages,
}: {
  notebookId: string;
  initialSessionId: string;
  initialMessages: ChatMessageSummary[];
}) {
  const [activeCitation, setActiveCitation] = React.useState<Citation | null>(null);

  return (
    <>
      <ChatPanel
        notebookId={notebookId}
        initialSessionId={initialSessionId}
        initialMessages={initialMessages}
        onOpenCitation={setActiveCitation}
      />
      <SourceViewerPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
    </>
  );
}
