import { describeLocator } from "@/lib/citations/locatorLabel";
import type { Citation } from "@/lib/retrieval/types";

/**
 * Inline `[n]` citation marker. Clicking it opens the Source Viewer at
 * `citation.locator` (plan Phase 4).
 */
export function CitationChip({
  citation,
  onOpen,
}: {
  citation: Citation;
  onOpen?: (citation: Citation) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(citation)}
      className="mx-0.5 inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary/15 align-super text-[10px] font-semibold text-primary transition-colors hover:bg-primary/25"
      title={`${citation.sourceTitle} — ${describeLocator(citation.locator)}`}
    >
      {citation.index}
    </button>
  );
}
