import { prisma } from "@/lib/db/prisma";
import type { NotebookSummary } from "@/lib/notebooks/types";

/**
 * Lists a user's notebooks with a source count and a per-status breakdown
 * (e.g. { READY: 3, INDEXING: 1 }) for the dashboard's status summary.
 * No sources exist until Phase 2, so statusCounts is currently always {}.
 */
export async function listNotebooksWithSummary(
  userId: string
): Promise<NotebookSummary[]> {
  const notebooks = await prisma.notebook.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { sources: true } } },
  });

  if (notebooks.length === 0) return [];

  const statusRows = await prisma.source.groupBy({
    by: ["notebookId", "status"],
    where: { notebookId: { in: notebooks.map((n) => n.id) } },
    _count: { _all: true },
  });

  const statusByNotebook = new Map<string, NotebookSummary["statusCounts"]>();
  for (const row of statusRows) {
    const bucket = statusByNotebook.get(row.notebookId) ?? {};
    bucket[row.status] = row._count._all;
    statusByNotebook.set(row.notebookId, bucket);
  }

  return notebooks.map((notebook) => ({
    id: notebook.id,
    title: notebook.title,
    description: notebook.description,
    createdAt: notebook.createdAt.toISOString(),
    updatedAt: notebook.updatedAt.toISOString(),
    sourceCount: notebook._count.sources,
    statusCounts: statusByNotebook.get(notebook.id) ?? {},
  }));
}

/** Returns the notebook only if it exists and belongs to userId — the ownership-check layer required by plan §7. */
export async function findOwnedNotebook(notebookId: string, userId: string) {
  return prisma.notebook.findFirst({
    where: { id: notebookId, userId },
  });
}

/** Same as findOwnedNotebook, but shaped like the dashboard's NotebookSummary (for the workspace header). */
export async function getOwnedNotebookSummary(
  notebookId: string,
  userId: string
): Promise<NotebookSummary | null> {
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId },
    include: { _count: { select: { sources: true } } },
  });
  if (!notebook) return null;

  const statusRows = await prisma.source.groupBy({
    by: ["status"],
    where: { notebookId },
    _count: { _all: true },
  });
  const statusCounts: NotebookSummary["statusCounts"] = {};
  for (const row of statusRows) {
    statusCounts[row.status] = row._count._all;
  }

  return {
    id: notebook.id,
    title: notebook.title,
    description: notebook.description,
    createdAt: notebook.createdAt.toISOString(),
    updatedAt: notebook.updatedAt.toISOString(),
    sourceCount: notebook._count.sources,
    statusCounts,
  };
}
