import type { SourceStatus } from "@prisma/client";

export type NotebookSummary = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  statusCounts: Partial<Record<SourceStatus, number>>;
};
