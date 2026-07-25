import { Badge } from "@/components/ui/badge";
import type { NotebookSummary } from "@/lib/notebooks/types";

const STATUS_LABEL: Record<string, string> = {
  READY: "ready",
  INDEXING: "indexing",
  QUEUED: "queued",
  UPLOADING: "uploading",
  FAILED: "failed",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  READY: "secondary",
  INDEXING: "outline",
  QUEUED: "outline",
  UPLOADING: "outline",
  FAILED: "destructive",
};

export function NotebookStatusSummary({
  notebook,
}: {
  notebook: NotebookSummary;
}) {
  if (notebook.sourceCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">No sources yet</p>
    );
  }

  const statusEntries = Object.entries(notebook.statusCounts).filter(
    ([, count]) => (count ?? 0) > 0
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted-foreground">
        {notebook.sourceCount} source{notebook.sourceCount === 1 ? "" : "s"}
      </span>
      {statusEntries.map(([status, count]) => (
        <Badge key={status} variant={STATUS_VARIANT[status] ?? "outline"}>
          {count} {STATUS_LABEL[status] ?? status.toLowerCase()}
        </Badge>
      ))}
    </div>
  );
}
