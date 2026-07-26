import type { SourceStatus, SourceType } from "@prisma/client";

export interface SourceSummary {
  id: string;
  notebookId: string;
  type: SourceType;
  title: string;
  originUrl: string | null;
  status: SourceStatus;
  progress: number;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
