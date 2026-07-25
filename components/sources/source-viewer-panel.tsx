import { BookOpen } from "lucide-react";

// Phase 1 placeholder: opens on citation click starting Phase 4
// (`PdfSourceViewer`, `UrlSourceViewer`, `YoutubeSourceViewer`,
// `TranscriptSourceViewer`, `TextSourceViewer`).
export function SourceViewerPanel() {
  return (
    <div className="flex h-full flex-col border-t md:border-t-0 md:border-l">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Source viewer</h2>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <BookOpen className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">No source open</p>
        <p className="max-w-56 text-xs text-muted-foreground">
          Click a citation in the chat to open its source here.
        </p>
      </div>
    </div>
  );
}
