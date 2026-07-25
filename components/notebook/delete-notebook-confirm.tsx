"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { NotebookSummary } from "@/lib/notebooks/types";

export function DeleteNotebookConfirm({
  notebook,
  open,
  onOpenChange,
  onDeleted,
}: {
  notebook: NotebookSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (notebookId: string) => void;
}) {
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete notebook");
      }
      onDeleted(notebook.id);
      toast.success("Notebook deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete notebook"
      );
    } finally {
      setDeleting(false);
      onOpenChange(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{notebook.title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the notebook and all of its sources,
            chunks, and chat history. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
