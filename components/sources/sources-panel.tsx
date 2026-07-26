"use client";

import * as React from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddSourceDialog } from "@/components/sources/add-source-dialog";
import { SourceListItem } from "@/components/sources/source-list-item";
import type { SourceSummary } from "@/lib/sources/types";

/** Left panel: source list, add-source button, live status chips (plan §8.1/§8.2). */
export function SourcesPanel({
  notebookId,
  initialSources,
}: {
  notebookId: string;
  initialSources: SourceSummary[];
}) {
  const [sources, setSources] = React.useState<SourceSummary[]>(initialSources);
  const [addOpen, setAddOpen] = React.useState(false);

  function handleAdded(source: SourceSummary) {
    setSources((prev) => [...prev, source]);
  }

  function handleChanged(updated: SourceSummary) {
    setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleRemoved(sourceId: string) {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
  }

  return (
    <div className="flex h-full flex-1 flex-col md:border-r">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Sources</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus /> Add
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <FileText className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No sources yet</p>
          <p className="max-w-56 text-xs text-muted-foreground">
            Add a PDF, pasted text, a website URL, a YouTube video, or a transcript file to get started.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 p-2">
            {sources.map((source) => (
              <SourceListItem
                key={source.id}
                source={source}
                onChanged={handleChanged}
                onRemoved={handleRemoved}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <AddSourceDialog
        notebookId={notebookId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={handleAdded}
      />
    </div>
  );
}
