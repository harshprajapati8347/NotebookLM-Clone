"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotebookCard } from "@/components/notebook/notebook-card";
import { CreateNotebookDialog } from "@/components/notebook/create-notebook-dialog";
import type { NotebookSummary } from "@/lib/notebooks/types";

export function NotebooksDashboard({
  initialNotebooks,
}: {
  initialNotebooks: NotebookSummary[];
}) {
  const [notebooks, setNotebooks] = React.useState(initialNotebooks);
  const [createOpen, setCreateOpen] = React.useState(false);

  function handleCreated(notebook: NotebookSummary) {
    setNotebooks((prev) => [notebook, ...prev]);
  }

  function handleUpdated(updated: NotebookSummary) {
    setNotebooks((prev) =>
      prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n))
    );
  }

  function handleDeleted(notebookId: string) {
    setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Your notebooks</h2>
          <p className="text-sm text-muted-foreground">
            {notebooks.length} notebook{notebooks.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New notebook
        </Button>
      </div>

      {notebooks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-24 text-center">
          <p className="text-lg font-medium">No notebooks yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create your first notebook to start adding sources and asking
            questions.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New notebook
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((notebook) => (
            <NotebookCard
              key={notebook.id}
              notebook={notebook}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <CreateNotebookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
