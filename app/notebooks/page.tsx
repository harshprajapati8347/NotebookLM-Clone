import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotebooksDashboard } from "@/components/notebook/notebooks-dashboard";
import { ensureUserSynced } from "@/lib/auth/sync-user";
import { listNotebooksWithSummary } from "@/lib/notebooks/queries";

export default async function NotebooksPage() {
  const user = await ensureUserSynced();
  const notebooks = await listNotebooksWithSummary(user.id);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Notebooks</h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>
      <NotebooksDashboard initialNotebooks={notebooks} />
    </div>
  );
}
