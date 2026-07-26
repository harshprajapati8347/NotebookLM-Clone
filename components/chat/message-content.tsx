import { Fragment } from "react";
import { CitationChip } from "./citation-chip";
import type { Citation } from "@/lib/retrieval/types";

const CITATION_PATTERN = /\[(\d+)\]/g;

/** Renders assistant text, swapping every validated `[n]` marker for a `CitationChip`. */
export function MessageContent({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  const citationByIndex = new Map(citations.map((c) => [c.index, c]));
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of content.matchAll(CITATION_PATTERN)) {
    const n = Number(match[1]);
    const citation = citationByIndex.get(n);
    const matchIndex = match.index ?? 0;

    if (!citation) continue;

    if (matchIndex > lastIndex) {
      parts.push(<Fragment key={key++}>{content.slice(lastIndex, matchIndex)}</Fragment>);
    }
    parts.push(<CitationChip key={key++} citation={citation} />);
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(<Fragment key={key++}>{content.slice(lastIndex)}</Fragment>);
  }

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{parts}</p>;
}
