"use client";

import * as React from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { TextContent } from "pdfjs-dist/types/src/display/api";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface HighlightRange {
  start: number;
  end: number;
}

/**
 * PDF viewer (react-pdf, plan §5/§8.2): jumps to the cited page and
 * highlights the cited chunk's text within that page's text layer.
 *
 * Highlighting works by re-deriving per-item character offsets from the
 * same page's `getTextContent()` pdf.js already fetches to render the text
 * layer, then locating the cited snippet inside that joined text — this
 * avoids relying on `unpdf`'s (ingestion-time) character offsets lining up
 * with pdf.js's own item boundaries, which aren't guaranteed to match.
 */
export function PdfSourceViewer({
  sourceId,
  page,
  snippet,
}: {
  sourceId: string;
  page: number;
  snippet: string;
}) {
  const [numPages, setNumPages] = React.useState<number | null>(null);
  const [pageNumber, setPageNumber] = React.useState(page);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const itemOffsetsRef = React.useRef<number[]>([]);
  const highlightRef = React.useRef<HighlightRange | null>(null);

  React.useEffect(() => {
    setPageNumber(page);
    setLoadError(null);
  }, [page, sourceId]);

  const fileUrl = `/api/sources/${sourceId}/content`;

  function handleGetTextSuccess(textContent: TextContent) {
    const offsets: number[] = [];
    let joined = "";

    for (const rawItem of textContent.items) {
      const str = "str" in rawItem && typeof rawItem.str === "string" ? rawItem.str : "";
      const normalized = str.replace(/\s+/g, " ");
      offsets.push(joined.length);
      joined += (joined ? " " : "") + normalized;
    }
    itemOffsetsRef.current = offsets;

    const haystack = joined.toLowerCase();
    const needle = normalizeWhitespace(snippet).toLowerCase().slice(0, 220);
    const start = needle.length > 0 ? haystack.indexOf(needle) : -1;
    highlightRef.current = start === -1 ? null : { start, end: start + needle.length };
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-4">
        <Document
          key={sourceId}
          file={fileUrl}
          loading={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading PDF…
            </div>
          }
          error={
            <p className="max-w-56 text-center text-sm text-destructive">
              Could not load this PDF.
            </p>
          }
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={(error) => setLoadError(error.message)}
        >
          {loadError ? (
            <p className="max-w-56 text-center text-sm text-destructive">{loadError}</p>
          ) : (
            <Page
              key={`${sourceId}-${pageNumber}`}
              pageNumber={pageNumber}
              width={520}
              onGetTextSuccess={handleGetTextSuccess}
              customTextRenderer={(textItem) => {
                const offsets = itemOffsetsRef.current;
                const highlight = highlightRef.current;
                const itemStart = offsets[textItem.itemIndex] ?? 0;
                const itemEnd = itemStart + textItem.str.length;

                if (!highlight || itemEnd <= highlight.start || itemStart >= highlight.end) {
                  return escapeHtml(textItem.str);
                }
                return `<mark class="rounded-sm bg-yellow-300/70 dark:bg-yellow-500/40">${escapeHtml(textItem.str)}</mark>`;
              }}
              className="shadow-sm"
            />
          )}
        </Document>
      </div>

      <div className="flex items-center justify-between border-t px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={pageNumber <= 1}
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft /> Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {pageNumber} of {numPages ?? "…"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!numPages || pageNumber >= numPages}
          onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p))}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
