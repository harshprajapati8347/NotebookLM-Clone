import { describeLocator } from "@/lib/citations/locatorLabel";
import type { Citation } from "@/lib/retrieval/types";

/** The numbered "Sources Used" list every grounded answer must show (plan §2.3). */
export function SourcesUsedList({
  citations,
  onOpenCitation,
}: {
  citations: Citation[];
  onOpenCitation?: (citation: Citation) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1 border-t pt-2">
      <p className="text-[11px] font-medium text-muted-foreground">Sources used</p>
      <ul className="flex flex-col gap-1">
        {citations.map((citation) => (
          <li key={citation.index}>
            <button
              type="button"
              onClick={() => onOpenCitation?.(citation)}
              className="flex w-full items-start gap-1.5 rounded text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                {citation.index}
              </span>
              <span className="line-clamp-1 underline-offset-2 hover:underline">
                {citation.sourceTitle} · {describeLocator(citation.locator)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
