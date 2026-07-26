import type { SourceType } from "@prisma/client";
import type { Locator } from "@/lib/adapters/types";
import { embedText } from "@/lib/ingestion/embed";
import { qdrant } from "@/lib/qdrant/client";
import { NOTEBOOK_CHUNKS_COLLECTION } from "@/lib/qdrant/collections";

export interface RetrievedChunk {
  pointId: string;
  score: number;
  sourceId: string;
  sourceType: SourceType;
  chunkIndex: number;
  locator: Locator;
  text: string;
}

const DEFAULT_TOP_K = 20;

/**
 * Embeds the question and searches Qdrant filtered by notebookId — the
 * mandatory isolation boundary (plan §3/§10): this filter is never optional
 * or client-controlled, it's baked into the function signature.
 */
export async function retrieveChunks(
  notebookId: string,
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  const queryVector = await embedText(query);

  const results = await qdrant.search(NOTEBOOK_CHUNKS_COLLECTION, {
    vector: queryVector,
    filter: {
      must: [{ key: "notebookId", match: { value: notebookId } }],
    },
    limit: topK,
    with_payload: true,
  });

  return results.map((point) => {
    const payload = point.payload as {
      sourceId: string;
      sourceType: SourceType;
      chunkIndex: number;
      locator: Locator;
      text: string;
    };
    return {
      pointId: String(point.id),
      score: point.score,
      sourceId: payload.sourceId,
      sourceType: payload.sourceType,
      chunkIndex: payload.chunkIndex,
      locator: payload.locator,
      text: payload.text,
    };
  });
}
