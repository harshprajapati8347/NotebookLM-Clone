import { Worker } from "bullmq";
import { redisConnection } from "./connection";
import { INGESTION_QUEUE_NAME, type IngestionJobData } from "./ingestionQueue";
import { processSource } from "@/lib/ingestion/pipeline";

/**
 * Real ingestion worker (Phase 2): extract -> chunk -> embed -> upsert ->
 * write Chunk rows -> Source.status, all inside `processSource`. Retries
 * are handled by BullMQ's queue-level `defaultJobOptions` (3 attempts,
 * exponential backoff) — `processSource` re-throws on failure so BullMQ
 * sees it and retries, while `Source.status` is already flipped to FAILED
 * for the UI on the very first attempt.
 */
export function startIngestionWorker() {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job) => {
      console.log(`[ingestion-worker] processing job ${job.id} for source ${job.data.sourceId}`);
      await processSource(job.data.sourceId);
    },
    { connection: redisConnection, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[ingestion-worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
