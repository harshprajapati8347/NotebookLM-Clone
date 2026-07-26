import type { SourceType } from "@prisma/client";
import type { Locator } from "@/lib/adapters/types";
import { qdrant } from "./client";
import { NOTEBOOK_CHUNKS_COLLECTION } from "./collections";

export interface ChunkPoint {
  pointId: string;
  vector: number[];
  notebookId: string;
  sourceId: string;
  sourceType: SourceType;
  chunkIndex: number;
  locator: Locator;
  text: string;
}

export async function upsertChunkPoints(points: ChunkPoint[]): Promise<void> {
  if (points.length === 0) return;

  await qdrant.upsert(NOTEBOOK_CHUNKS_COLLECTION, {
    wait: true,
    points: points.map((p) => ({
      id: p.pointId,
      vector: p.vector,
      payload: {
        notebookId: p.notebookId,
        sourceId: p.sourceId,
        sourceType: p.sourceType,
        chunkIndex: p.chunkIndex,
        locator: p.locator,
        text: p.text,
      },
    })),
  });
}

/** Removes every vector belonging to a source — used before re-indexing and on source delete. */
export async function deleteSourcePoints(sourceId: string): Promise<void> {
  await qdrant.delete(NOTEBOOK_CHUNKS_COLLECTION, {
    wait: true,
    filter: {
      must: [{ key: "sourceId", match: { value: sourceId } }],
    },
  });
}
