import { prisma } from "@/lib/db/prisma";
import type { SourceSummary } from "./types";

function toSummary(source: {
  id: string;
  notebookId: string;
  type: SourceSummary["type"];
  title: string;
  originUrl: string | null;
  status: SourceSummary["status"];
  progress: number;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SourceSummary {
  return {
    id: source.id,
    notebookId: source.notebookId,
    type: source.type,
    title: source.title,
    originUrl: source.originUrl,
    status: source.status,
    progress: source.progress,
    errorMessage: source.errorMessage,
    metadata: (source.metadata as Record<string, unknown> | null) ?? null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

export async function listSourcesForNotebook(notebookId: string): Promise<SourceSummary[]> {
  const sources = await prisma.source.findMany({
    where: { notebookId },
    orderBy: { createdAt: "asc" },
  });
  return sources.map(toSummary);
}

/** Ownership-checked lookup: only returns the source if its notebook belongs to userId. */
export async function findOwnedSource(sourceId: string, userId: string) {
  return prisma.source.findFirst({
    where: { id: sourceId, notebook: { userId } },
  });
}

export function serializeSource(source: Parameters<typeof toSummary>[0]): SourceSummary {
  return toSummary(source);
}
