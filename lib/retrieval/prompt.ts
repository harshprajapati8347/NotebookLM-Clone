import { prisma } from "@/lib/db/prisma";
import { describeLocator } from "@/lib/citations/locatorLabel";
import type { RetrievedChunk } from "./retrieve";
import type { ContextChunk } from "./types";

/** Looks up each chunk's source title so the prompt/citations can show
 * human-readable "Source: <title>" instead of a bare id. */
export async function attachSourceTitles(chunks: RetrievedChunk[]): Promise<ContextChunk[]> {
  if (chunks.length === 0) return [];

  const sourceIds = [...new Set(chunks.map((c) => c.sourceId))];
  const sources = await prisma.source.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, title: true },
  });
  const titleById = new Map(sources.map((s) => [s.id, s.title]));

  return chunks.map((chunk) => ({
    ...chunk,
    sourceTitle: titleById.get(chunk.sourceId) ?? "Untitled source",
  }));
}

/** Numbered context block — one [n] per chunk, matching the citation markers
 * the system prompt instructs the model to emit. */
export function buildContextBlock(chunks: ContextChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const n = i + 1;
      const locatorLabel = describeLocator(chunk.locator);
      return `[${n}] Source: "${chunk.sourceTitle}" (${locatorLabel})\n${chunk.text}`;
    })
    .join("\n\n");
}

export const SYSTEM_PROMPT = `You are a research assistant answering questions strictly using the numbered context excerpts provided below, which come from the user's own uploaded sources in this notebook.

Rules:
- Only use information found in the context excerpts. Never use outside knowledge, and never guess.
- Every factual claim in your answer must be followed by a citation marker like [1] or [2] pointing at the context excerpt(s) it came from. Use the exact excerpt number shown before "Source:" in the context.
- You may cite multiple excerpts for one claim, e.g. "...as shown in the data [1][3]."
- If the context excerpts do not contain enough information to answer the question, say so plainly and directly (e.g. "The provided sources don't cover that.") instead of guessing or answering from general knowledge.
- Be concise and directly answer the question; do not repeat the excerpts verbatim.`;

export function buildUserPrompt(question: string, contextBlock: string): string {
  return `Context excerpts from this notebook's sources:\n\n${contextBlock}\n\n---\n\nQuestion: ${question}`;
}
