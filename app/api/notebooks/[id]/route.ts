import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { findOwnedNotebook } from "@/lib/notebooks/queries";
import { updateNotebookSchema } from "@/lib/notebooks/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await findOwnedNotebook(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateNotebookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 }
    );
  }

  const notebook = await prisma.notebook.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
    },
    include: { _count: { select: { sources: true } } },
  });

  return NextResponse.json({
    notebook: {
      id: notebook.id,
      title: notebook.title,
      description: notebook.description,
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
      sourceCount: notebook._count.sources,
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await findOwnedNotebook(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  // Cascades sources -> chunks, chat sessions -> chat messages (see schema.prisma onDelete: Cascade).
  await prisma.notebook.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
