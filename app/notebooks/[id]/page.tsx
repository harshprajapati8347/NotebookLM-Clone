import { notFound } from "next/navigation";
import { NotebookWorkspaceHeader } from "@/components/notebook/notebook-workspace-header";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceViewerPanel } from "@/components/sources/source-viewer-panel";
import { ensureUserSynced } from "@/lib/auth/sync-user";
import { getOwnedNotebookSummary } from "@/lib/notebooks/queries";
import { listSourcesForNotebook } from "@/lib/sources/queries";
import { getOrCreateActiveChatSession } from "@/lib/chat/queries";

export default async function NotebookWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await ensureUserSynced();
  const { id } = await params;

  const notebook = await getOwnedNotebookSummary(id, user.id);
  if (!notebook) {
    notFound();
  }

  const sources = await listSourcesForNotebook(id);
  const chatSession = await getOrCreateActiveChatSession(id);

  return (
    <div className="flex flex-1 flex-col">
      <NotebookWorkspaceHeader notebook={notebook} />
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[280px_1fr_300px]">
        <SourcesPanel notebookId={id} initialSources={sources} />
        <ChatPanel
          notebookId={id}
          initialSessionId={chatSession.sessionId}
          initialMessages={chatSession.messages}
        />
        <SourceViewerPanel />
      </div>
    </div>
  );
}
