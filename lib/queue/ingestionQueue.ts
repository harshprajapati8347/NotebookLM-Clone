import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export const INGESTION_QUEUE_NAME = "source-ingestion";

export interface IngestionJobData {
  sourceId: string;
}

// Wired in Phase 0; adapters/processing land in Phase 2.
export const ingestionQueue = new Queue<IngestionJobData>(INGESTION_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
