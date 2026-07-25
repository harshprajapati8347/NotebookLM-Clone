"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NotebookSummary } from "@/lib/notebooks/types";

export function RenameNotebookDialog({
  notebook,
  open,
  onOpenChange,
  onUpdated,
}: {
  notebook: NotebookSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (notebook: NotebookSummary) => void;
}) {
  const [title, setTitle] = React.useState(notebook.title);
  const [description, setDescription] = React.useState(
    notebook.description ?? ""
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle(notebook.title);
      setDescription(notebook.description ?? "");
    }
  }, [open, notebook.title, notebook.description]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Title can't be empty");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update notebook");
      }
      onUpdated({ ...notebook, ...data.notebook });
      onOpenChange(false);
      toast.success("Notebook updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update notebook"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename notebook</DialogTitle>
            <DialogDescription>
              Update the title or description of this notebook.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rename-notebook-title">Title</Label>
              <Input
                id="rename-notebook-title"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rename-notebook-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="rename-notebook-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
