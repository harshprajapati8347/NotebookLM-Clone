"use client";

import * as React from "react";
import Link from "next/link";
import { MoreVertical, NotebookText, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotebookStatusSummary } from "@/components/notebook/notebook-status-summary";
import { RenameNotebookDialog } from "@/components/notebook/rename-notebook-dialog";
import { DeleteNotebookConfirm } from "@/components/notebook/delete-notebook-confirm";
import type { NotebookSummary } from "@/lib/notebooks/types";

export function NotebookCard({
  notebook,
  onUpdated,
  onDeleted,
}: {
  notebook: NotebookSummary;
  onUpdated: (notebook: NotebookSummary) => void;
  onDeleted: (notebookId: string) => void;
}) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <Card className="group relative transition-shadow hover:shadow-md">
        <Link
          href={`/notebooks/${notebook.id}`}
          className="absolute inset-0 z-0"
          aria-label={`Open ${notebook.title}`}
        />
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 pr-2">
              <NotebookText className="size-4 shrink-0 text-muted-foreground" />
              <span className="line-clamp-1">{notebook.title}</span>
            </CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative z-10 shrink-0"
                  aria-label="Notebook actions"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
            {notebook.description || "No description"}
          </p>
          <NotebookStatusSummary notebook={notebook} />
        </CardContent>
      </Card>

      <RenameNotebookDialog
        notebook={notebook}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onUpdated={onUpdated}
      />
      <DeleteNotebookConfirm
        notebook={notebook}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onDeleted}
      />
    </>
  );
}
