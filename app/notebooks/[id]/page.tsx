import { notFound } from "next/navigation";
import { NotebookWorkspaceHeader } from "@/components/notebook/notebook-workspace-header";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { SourceViewerPanel } from "@/components/sources/source-viewer-panel";
import { ensureUserSynced } from "@/lib/auth/sync-user";
import { getOwnedNotebookSummary } from "@/lib/notebooks/queries";

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

  return (
    <div className="flex flex-1 flex-col">
      <NotebookWorkspaceHeader notebook={notebook} />
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[280px_1fr_300px]">
        <SourcesPanel />
        <ChatPanel />
        <SourceViewerPanel />
      </div>
    </div>
  );
}
