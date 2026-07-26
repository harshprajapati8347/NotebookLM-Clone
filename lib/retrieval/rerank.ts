import type { RetrievedChunk } from "./retrieve";

const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const RERANK_MODEL = "rerank-v3.5";
const DEFAULT_TOP_K = 6;

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Cohere Rerank: one cheap cross-encoder call over the top-K vector-search
 * results, keeping only the top-k most relevant (plan §3, step [3]). Uses a
 * plain fetch instead of the Cohere SDK — this is the only call site that
 * needs it, so a full SDK dependency isn't worth it.
 *
 * Falls back to keeping the top-k by vector score if COHERE_API_KEY isn't
 * set or the API call fails — a missing rerank step degrades retrieval
 * quality but should never break the chat pipeline outright.
 */
export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];

  const limit = Math.min(topK, chunks.length);
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    console.warn("[retrieval] COHERE_API_KEY not set — skipping rerank, using vector-score order");
    return chunks.slice(0, limit);
  }

  try {
    const response = await fetch(COHERE_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: chunks.map((c) => c.text),
        top_n: limit,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Cohere rerank failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as { results: CohereRerankResult[] };
    return data.results.map((r) => ({ ...chunks[r.index], score: r.relevance_score }));
  } catch (error) {
    console.error("[retrieval] rerank call failed, falling back to vector-score order:", error);
    return chunks.slice(0, limit);
  }
}
