import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as { openai: OpenAI | undefined };

const openai =
  globalForOpenAI.openai ?? new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForOpenAI.openai = openai;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

const BATCH_SIZE = 100;

/** Embeds many texts in OpenAI-API-friendly batches, preserving input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    embeddings.push(...response.data.map((d) => d.embedding));
  }

  return embeddings;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
