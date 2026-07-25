import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Phase 1 placeholder: the real source list, upload flow, and status
// polling land in Phase 2 (`AddSourceDialog`, `SourceListItem`).
export function SourcesPanel() {
  return (
    <div className="flex h-full flex-col border-b md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Sources</h2>
        <Button size="sm" disabled>
          <Plus /> Add
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <FileText className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">No sources yet</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          Adding PDFs, text, URLs, YouTube videos, and transcripts arrives in
          Phase 2.
        </p>
      </div>
    </div>
  );
}
