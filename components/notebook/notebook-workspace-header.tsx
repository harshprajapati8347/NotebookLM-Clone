"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RenameNotebookDialog } from "@/components/notebook/rename-notebook-dialog";
import { DeleteNotebookConfirm } from "@/components/notebook/delete-notebook-confirm";
import type { NotebookSummary } from "@/lib/notebooks/types";

export function NotebookWorkspaceHeader({
  notebook: initialNotebook,
}: {
  notebook: NotebookSummary;
}) {
  const router = useRouter();
  const [notebook, setNotebook] = React.useState(initialNotebook);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/notebooks" aria-label="Back to notebooks">
              <ArrowLeft />
            </Link>
          </Button>
          <h1 className="truncate text-lg font-semibold">{notebook.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Notebook actions">
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
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <RenameNotebookDialog
        notebook={notebook}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onUpdated={(updated) => setNotebook((prev) => ({ ...prev, ...updated }))}
      />
      <DeleteNotebookConfirm
        notebook={notebook}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push("/notebooks")}
      />
    </>
  );
}
