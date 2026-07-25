import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { listNotebooksWithSummary } from "@/lib/notebooks/queries";
import { createNotebookSchema } from "@/lib/notebooks/validation";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notebooks = await listNotebooksWithSummary(userId);
  return NextResponse.json({ notebooks });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createNotebookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 }
    );
  }

  const notebook = await prisma.notebook.create({
    data: {
      userId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    },
  });

  return NextResponse.json(
    {
      notebook: {
        id: notebook.id,
        title: notebook.title,
        description: notebook.description,
        createdAt: notebook.createdAt.toISOString(),
        updatedAt: notebook.updatedAt.toISOString(),
        sourceCount: 0,
        statusCounts: {},
      },
    },
    { status: 201 }
  );
}
