"use client";

import * as React from "react";
import { FileText, MessageSquare, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceViewerPanel } from "@/components/sources/source-viewer-panel";
import type { ChatMessageSummary } from "@/lib/chat/types";
import type { Citation } from "@/lib/retrieval/types";
import type { SourceSummary } from "@/lib/sources/types";

type MobileTab = "sources" | "chat" | "viewer";

const MOBILE_TABS: { key: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "sources", label: "Sources", icon: FileText },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "viewer", label: "Viewer", icon: BookOpen },
];

/**
 * Owns every panel in the notebook workspace, plus the two bits of state
 * that need to be shared across them:
 *  - `activeCitation`: which citation is currently open in the Source
 *    Viewer (plan Phase 4) — shared between `ChatPanel` (where citations
 *    are clicked) and `SourceViewerPanel` (where they open).
 *  - `mobileTab`: which single panel is visible below the `md` breakpoint
 *    (plan §8.3: "panels collapse to tabs under `md` breakpoint"). All
 *    three panels stay mounted at all times (never unmounted) so their own
 *    internal state — chat history, polling, loaded source content — is
 *    preserved when switching tabs; only CSS visibility changes.
 */
export function WorkspacePanels({
  notebookId,
  initialSources,
  initialSessionId,
  initialMessages,
}: {
  notebookId: string;
  initialSources: SourceSummary[];
  initialSessionId: string;
  initialMessages: ChatMessageSummary[];
}) {
  const [activeCitation, setActiveCitation] = React.useState<Citation | null>(null);
  const [mobileTab, setMobileTab] = React.useState<MobileTab>("chat");

  function handleOpenCitation(citation: Citation) {
    setActiveCitation(citation);
    setMobileTab("viewer");
  }

  return (
    <>
      <div className="flex shrink-0 items-center border-b md:hidden">
        {MOBILE_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors",
              mobileTab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className={cn(mobileTab === "sources" ? "flex min-h-0 flex-1" : "hidden", "md:flex md:h-full")}>
        <SourcesPanel notebookId={notebookId} initialSources={initialSources} />
      </div>
      <div className={cn(mobileTab === "chat" ? "flex min-h-0 flex-1" : "hidden", "md:flex md:h-full")}>
        <ChatPanel
          notebookId={notebookId}
          initialSessionId={initialSessionId}
          initialMessages={initialMessages}
          onOpenCitation={handleOpenCitation}
        />
      </div>
      <div className={cn(mobileTab === "viewer" ? "flex min-h-0 flex-1" : "hidden", "md:flex md:h-full")}>
        <SourceViewerPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
      </div>
    </>
  );
}
