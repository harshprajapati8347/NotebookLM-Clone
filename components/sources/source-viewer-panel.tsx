"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { BookOpen, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextSourceViewer } from "./text-source-viewer";
import { UrlSourceViewer } from "./url-source-viewer";
import { YoutubeSourceViewer } from "./youtube-source-viewer";
import { TranscriptSourceViewer } from "./transcript-source-viewer";
import type { Citation } from "@/lib/retrieval/types";
import type { SourceContentPayload } from "@/lib/sources/content";

// `pdfjs-dist` touches browser-only globals (DOMMatrix, Path2D, ...) at
// module-evaluation time, which crashes if it's ever evaluated during SSR.
// `ssr: false` guarantees this module is only loaded in the browser.
const PdfSourceViewer = dynamic(
  () => import("./pdf-source-viewer").then((mod) => mod.PdfSourceViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading PDF viewer…
      </div>
    ),
  }
);

type ContentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; sourceId: string; data: SourceContentPayload };

/**
 * Right panel: opens on citation click, rendering the right per-type
 * viewer at the exact cited spot (plan §2.4/Phase 4). PDF loads its own
 * binary content directly (`PdfSourceViewer` fetches the raw file itself);
 * every other type's JSON content is fetched once per source id here and
 * handed down to the matching viewer.
 */
export function SourceViewerPanel({
  citation,
  onClose,
}: {
  citation: Citation | null;
  onClose: () => void;
}) {
  const [content, setContent] = React.useState<ContentState>({ status: "idle" });

  React.useEffect(() => {
    if (!citation || citation.sourceType === "PDF") return;
    if (content.status === "ready" && content.sourceId === citation.sourceId) return;

    let cancelled = false;
    setContent({ status: "loading" });

    fetch(`/api/sources/${citation.sourceId}/content`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load source content");
        return data as SourceContentPayload;
      })
      .then((data) => {
        if (!cancelled) setContent({ status: "ready", sourceId: citation.sourceId, data });
      })
      .catch((error) => {
        if (!cancelled) {
          setContent({
            status: "error",
            message: error instanceof Error ? error.message : "Failed to load source content",
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citation?.sourceId, citation?.sourceType]);

  if (!citation) {
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

  return (
    <div className="flex h-full flex-col border-t md:border-t-0 md:border-l">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="line-clamp-1 min-w-0 text-sm font-semibold">{citation.sourceTitle}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close source viewer">
          <X />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">{renderViewer(citation, content)}</div>
    </div>
  );
}

function renderViewer(citation: Citation, content: ContentState) {
  if (citation.sourceType === "PDF") {
    if (citation.locator.kind !== "pdf") return null;
    return (
      <PdfSourceViewer
        sourceId={citation.sourceId}
        page={citation.locator.page}
        snippet={citation.snippet}
      />
    );
  }

  if (content.status === "loading" || content.status === "idle") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (content.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
        {content.message}
      </div>
    );
  }

  const { data } = content;

  if (data.kind === "text" && citation.locator.kind === "text") {
    return (
      <TextSourceViewer
        fullText={data.fullText}
        charStart={citation.locator.charStart}
        charEnd={citation.locator.charEnd}
      />
    );
  }

  if (data.kind === "url" && citation.locator.kind === "url") {
    return (
      <UrlSourceViewer
        title={data.title}
        originUrl={data.originUrl}
        paragraphs={data.paragraphs}
        paragraphIndex={citation.locator.paragraphIndex}
      />
    );
  }

  if (data.kind === "youtube" && citation.locator.kind === "youtube") {
    return (
      <YoutubeSourceViewer
        videoId={data.videoId}
        title={data.title}
        channel={data.channel}
        startSec={citation.locator.startSec}
      />
    );
  }

  if (data.kind === "vtt" && citation.locator.kind === "vtt") {
    return (
      <TranscriptSourceViewer
        cues={data.cues}
        cueIndex={citation.locator.cueIndex}
        endSec={citation.locator.endSec}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      Unable to display this source.
    </div>
  );
}
