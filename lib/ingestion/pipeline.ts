import { prisma } from "@/lib/db/prisma";
import { getAdapterForType, AdapterError } from "@/lib/adapters";
import { deleteSourcePoints, upsertChunkPoints } from "@/lib/qdrant/points";
import { deterministicPointId } from "@/lib/qdrant/pointId";
import { chunkSegments } from "./chunker";
import { embedTexts } from "./embed";

async function setProgress(sourceId: string, progress: number) {
  await prisma.source.update({
    where: { id: sourceId },
    data: { progress },
  });
}

/**
 * Full per-source ingestion pipeline (plan §3): extract -> chunk -> embed ->
 * upsert into Qdrant (namespaced by notebookId) -> write Chunk rows ->
 * Source.status/progress. Also the entry point for re-indexing: any
 * previously-written chunks/vectors for this source are wiped first, so
 * repeated runs never leave stale/duplicate data behind.
 */
export async function processSource(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    console.warn(`[ingestion] source ${sourceId} no longer exists, skipping`);
    return;
  }

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "INDEXING", progress: 0, errorMessage: null },
    });

    // Wipe any prior run's chunks/vectors up front so re-index is idempotent
    // regardless of whether the new run produces more/fewer chunks.
    await deleteSourcePoints(sourceId);
    await prisma.chunk.deleteMany({ where: { sourceId } });

    console.log(`[ingestion] [${sourceId}] extracting (${source.type})`);
    const adapter = getAdapterForType(source.type);
    const raw = await adapter.extract(source);
    await setProgress(sourceId, 15);

    console.log(`[ingestion] [${sourceId}] chunking ${raw.segments.length} segments`);
    const chunks = chunkSegments(raw.segments);
    if (chunks.length === 0) {
      throw new AdapterError("No chunkable content was extracted from this source");
    }
    await setProgress(sourceId, 25);

    console.log(`[ingestion] [${sourceId}] embedding ${chunks.length} chunks`);
    const vectors = await embedTexts(chunks.map((c) => c.text));
    await setProgress(sourceId, 70);

    console.log(`[ingestion] [${sourceId}] upserting vectors + writing chunk rows`);
    const points = chunks.map((chunk, index) => ({
      pointId: deterministicPointId(sourceId, index),
      vector: vectors[index],
      notebookId: source.notebookId,
      sourceId: source.id,
      sourceType: source.type,
      chunkIndex: index,
      locator: chunk.locator,
      text: chunk.text,
    }));
    await upsertChunkPoints(points);
    await setProgress(sourceId, 90);

    await prisma.chunk.createMany({
      data: points.map((point) => ({
        sourceId: source.id,
        notebookId: source.notebookId,
        chunkIndex: point.chunkIndex,
        text: point.text,
        locator: point.locator,
        tokenCount: chunks[point.chunkIndex].tokenCount,
        vectorPointId: point.pointId,
      })),
    });

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        progress: 100,
        errorMessage: null,
        metadata: raw.metadata ? JSON.parse(JSON.stringify(raw.metadata)) : source.metadata,
      },
    });

    console.log(`[ingestion] [${sourceId}] done — ${chunks.length} chunks ready`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ingestion] [${sourceId}] failed:`, message);

    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "FAILED", errorMessage: message },
    });

    // Re-throw so BullMQ still records the job as failed (retries/backoff
    // per lib/queue/ingestionQueue.ts), even though the user-facing state
    // (Source.status = FAILED) is already visible immediately.
    throw error;
  }
}
