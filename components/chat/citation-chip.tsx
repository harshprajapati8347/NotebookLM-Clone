import { describeLocator } from "@/lib/citations/locatorLabel";
import type { Citation } from "@/lib/retrieval/types";

/**
 * Inline `[n]` citation marker. Non-clickable placeholder for now (plan
 * Phase 3) — Phase 4 wires this up to open the Source Viewer at
 * `citation.locator`.
 */
export function CitationChip({ citation }: { citation: Citation }) {
  return (
    <span
      className="mx-0.5 inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-full bg-primary/15 align-super text-[10px] font-semibold text-primary"
      title={`${citation.sourceTitle} — ${describeLocator(citation.locator)}`}
    >
      {citation.index}
    </span>
  );
}
