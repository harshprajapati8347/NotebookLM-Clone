import { Worker } from "bullmq";
import { redisConnection } from "./connection";
import { INGESTION_QUEUE_NAME, type IngestionJobData } from "./ingestionQueue";

// Stub worker: connection is wired end-to-end in Phase 0, but the actual
// extract -> chunk -> embed -> upsert pipeline is built in Phase 2.
export function startIngestionWorker() {
  return new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job) => {
      console.log(`[ingestion-worker] received job ${job.id} for source ${job.data.sourceId} (no-op until Phase 2)`);
    },
    { connection: redisConnection }
  );
}
