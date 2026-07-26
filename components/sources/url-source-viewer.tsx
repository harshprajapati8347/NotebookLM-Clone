"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Readable article preview, scrolled + highlighted to the cited paragraph
 * (plan §2.4). `paragraphs` is re-extracted at request time by the same
 * Readability pipeline used at ingestion (`/api/sources/:id/content`), so
 * `paragraphIndex` lines up directly — see that route's known limitation if
 * the live page has changed since ingestion.
 */
export function UrlSourceViewer({
  title,
  originUrl,
  paragraphs,
  paragraphIndex,
}: {
  title: string | null;
  originUrl: string;
  paragraphs: string[];
  paragraphIndex: number;
}) {
  const highlightRef = React.useRef<HTMLParagraphElement>(null);

  React.useEffect(() => {
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [paragraphIndex]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        <div>
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          <a
            href={originUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {originUrl} <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="flex flex-col gap-3 text-sm leading-relaxed">
          {paragraphs.map((paragraph, index) =>
            index === paragraphIndex ? (
              <p
                key={index}
                ref={highlightRef}
                className="rounded-sm bg-yellow-300/40 px-1 -mx-1 dark:bg-yellow-500/20"
              >
                {paragraph}
              </p>
            ) : (
              <p key={index}>{paragraph}</p>
            )
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
