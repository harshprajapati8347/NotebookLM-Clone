import { qdrant } from "./client";

export const NOTEBOOK_CHUNKS_COLLECTION = "notebook_chunks";

// 1536-d to match OpenAI text-embedding-3-small.
const VECTOR_SIZE = 1536;

/**
 * Idempotently ensures the `notebook_chunks` collection exists with the
 * config from docs/NotebookLM-Clone-Project-Plan.md §4.2, including payload
 * indexes on the fields we filter/scope by (notebookId is the mandatory
 * isolation filter on every query).
 */
export async function ensureNotebookChunksCollection(): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === NOTEBOOK_CHUNKS_COLLECTION
  );

  if (!exists) {
    await qdrant.createCollection(NOTEBOOK_CHUNKS_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });
  }

  await Promise.all(
    ["notebookId", "sourceId", "sourceType"].map((field) =>
      qdrant.createPayloadIndex(NOTEBOOK_CHUNKS_COLLECTION, {
        field_name: field,
        field_schema: "keyword",
      })
    )
  );
}
