import "dotenv/config";
import { ensureNotebookChunksCollection, NOTEBOOK_CHUNKS_COLLECTION } from "../lib/qdrant/collections";

async function main() {
  await ensureNotebookChunksCollection();
  console.log(`Qdrant collection "${NOTEBOOK_CHUNKS_COLLECTION}" is ready.`);
}

main().catch((err) => {
  console.error("Failed to set up Qdrant collection:", err);
  process.exit(1);
});
