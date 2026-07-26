import type { ContextChunk, Citation } from "./types";

const CITATION_PATTERN = /\[(\d+)\]/g;
const SNIPPET_LENGTH = 240;

/**
 * Mandatory citation-validation step (plan §3, step [6]): every [n] marker
 * the model emits must map to an actually-retrieved context chunk. Anything
 * out of range (a number the model invented, e.g. because it saw "[7]"
 * somewhere in training data and hallucinated it) is stripped from the
 * rendered text and never reaches the "Sources Used" list.
 */
export function validateCitations(
  rawText: string,
  contextChunks: ContextChunk[]
): { cleanedText: string; citations: Citation[] } {
  const seenIndexes: number[] = [];

  const cleanedText = rawText.replace(CITATION_PATTERN, (match, numStr: string) => {
    const n = Number(numStr);
    const isValid = Number.isInteger(n) && n >= 1 && n <= contextChunks.length;
    if (!isValid) return "";
    if (!seenIndexes.includes(n)) seenIndexes.push(n);
    return match;
  });

  const citations: Citation[] = seenIndexes
    .sort((a, b) => a - b)
    .map((n) => {
      const chunk = contextChunks[n - 1];
      return {
        index: n,
        sourceId: chunk.sourceId,
        sourceTitle: chunk.sourceTitle,
        sourceType: chunk.sourceType,
        locator: chunk.locator,
        snippet:
          chunk.text.length > SNIPPET_LENGTH
            ? `${chunk.text.slice(0, SNIPPET_LENGTH)}…`
            : chunk.text,
      };
    });

  return { cleanedText, citations };
}
