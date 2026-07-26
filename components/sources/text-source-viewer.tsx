"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Plain text panel with the cited char range highlighted (plan §2.4). The
 * range is exact — `TextAdapter` computes `charStart`/`charEnd` directly
 * against this same `fullText` string at ingestion time (plan §6), so no
 * fuzzy matching is needed here, unlike the PDF viewer.
 */
export function TextSourceViewer({
  fullText,
  charStart,
  charEnd,
}: {
  fullText: string;
  charStart: number;
  charEnd: number;
}) {
  const highlightRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [charStart, charEnd]);

  const before = fullText.slice(0, charStart);
  const highlighted = fullText.slice(charStart, charEnd);
  const after = fullText.slice(charEnd);

  return (
    <ScrollArea className="h-full">
      <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
        {before}
        <mark ref={highlightRef} className="rounded-sm bg-yellow-300/70 dark:bg-yellow-500/40">
          {highlighted || " "}
        </mark>
        {after}
      </p>
    </ScrollArea>
  );
}
