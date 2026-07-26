import "dotenv/config";
import { startIngestionWorker } from "@/lib/queue/ingestionWorker";

// Long-running process, separate from the Next.js server — run via `npm run worker`.
const worker = startIngestionWorker();
console.log("[worker] ingestion worker started, waiting for jobs...");

async function shutdown() {
  console.log("[worker] shutting down...");
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
