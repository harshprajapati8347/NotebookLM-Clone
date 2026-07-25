import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/notebooks");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-end p-4">
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
          NotebookLM Clone
        </h1>
        <p className="max-w-md text-muted-foreground">
          A multi-notebook research assistant. Add sources, ask questions,
          and get grounded, cited answers.
        </p>
        <SignInButton mode="modal">
          <Button size="lg">Sign in with Google</Button>
        </SignInButton>
      </main>
    </div>
  );
}
