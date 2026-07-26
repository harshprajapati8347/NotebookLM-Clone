"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ParsedCue } from "@/lib/adapters/vttParser";

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Scrollable cue list, auto-scrolled + highlighted at the cited cue range
 * (plan §2.4). `locator.cueIndex` is the exact raw-cue array index
 * `VttAdapter` recorded as the merged chunk's first cue (plan §6's
 * cue-merge strategy), so it indexes directly into `cues` with no fuzzy
 * matching needed. Every cue up to `locator.endSec` is highlighted, since
 * one citation can span several raw cues merged into one ~45s chunk.
 */
export function TranscriptSourceViewer({
  cues,
  cueIndex,
  endSec,
}: {
  cues: ParsedCue[];
  cueIndex: number;
  endSec: number;
}) {
  const highlightRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cueIndex]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-3">
        {cues.map((cue, index) => {
          const isHighlighted = index >= cueIndex && cue.startSec < endSec;
          return (
            <div
              key={index}
              ref={index === cueIndex ? highlightRef : undefined}
              className={`flex gap-2 rounded-md px-2 py-1.5 text-sm ${
                isHighlighted ? "bg-yellow-300/40 dark:bg-yellow-500/20" : ""
              }`}
            >
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatTimestamp(cue.startSec)}
              </span>
              <span className="leading-relaxed">{cue.text}</span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
