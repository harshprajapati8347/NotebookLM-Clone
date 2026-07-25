import { QdrantClient } from "@qdrant/js-client-rest";

const globalForQdrant = globalThis as unknown as {
  qdrant: QdrantClient | undefined;
};

export const qdrant =
  globalForQdrant.qdrant ??
  new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.qdrant = qdrant;
}
