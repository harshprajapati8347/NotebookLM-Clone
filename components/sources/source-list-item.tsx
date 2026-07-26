"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  FileText,
  Link2,
  MoreVertical,
  RefreshCw,
  Subtitles,
  Trash2,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SourceSummary } from "@/lib/sources/types";

const TYPE_ICON: Record<SourceSummary["type"], React.ComponentType<{ className?: string }>> = {
  PDF: FileText,
  TEXT: FileText,
  URL: Link2,
  YOUTUBE: Video,
  VTT: Subtitles,
};

function StatusBadge({ source }: { source: SourceSummary }) {
  switch (source.status) {
    case "READY":
      return <Badge variant="secondary">Ready</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    case "INDEXING":
      return <Badge variant="outline">Indexing {source.progress}%</Badge>;
    case "QUEUED":
      return <Badge variant="outline">Queued</Badge>;
    case "UPLOADING":
      return <Badge variant="outline">Uploading…</Badge>;
    default:
      return null;
  }
}

export function SourceListItem({
  source,
  onChanged,
  onRemoved,
}: {
  source: SourceSummary;
  onChanged: (source: SourceSummary) => void;
  onRemoved: (sourceId: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const Icon = TYPE_ICON[source.type];
  const isPolling = source.status === "QUEUED" || source.status === "INDEXING";

  React.useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sources/${source.id}/status`);
        if (!res.ok) return;
        const data = await res.json();
        onChanged({ ...source, status: data.status, progress: data.progress, errorMessage: data.errorMessage });
      } catch {
        // transient poll failure — try again on the next tick
      }
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling, source.id]);

  async function handleReindex() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${source.id}/reindex`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to re-index");
      onChanged(data.source as SourceSummary);
      toast.success("Re-indexing started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to re-index");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove source");
      }
      onRemoved(source.id);
      toast.success("Source removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove source");
      setBusy(false);
    }
  }

  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-accent/50">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 overflow-hidden">
        <p className="line-clamp-1 text-sm font-medium">{source.title}</p>
        <div className="mt-1 flex items-center gap-1.5">
          <StatusBadge source={source} />
        </div>
        {source.status === "FAILED" && source.errorMessage && (
          <p className="mt-1 line-clamp-2 text-xs text-destructive">{source.errorMessage}</p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 opacity-0 group-hover:opacity-100"
            disabled={busy}
            aria-label="Source actions"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={handleReindex} disabled={busy}>
            <RefreshCw /> Re-index
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={handleDelete} disabled={busy}>
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
