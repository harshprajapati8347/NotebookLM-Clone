import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { deleteSourcePoints } from "@/lib/qdrant/points";
import { deleteSourceFiles } from "@/lib/storage";
import { findOwnedSource } from "@/lib/sources/queries";

type RouteParams = { params: Promise<{ id: string }> };

/** Removes a source, cascading its chunks (DB FK) and vectors + on-disk file. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await findOwnedSource(id, userId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  await deleteSourcePoints(source.id);
  await deleteSourceFiles(source.notebookId, source.id);
  // Chunk rows cascade via onDelete: Cascade on Chunk.source in schema.prisma.
  await prisma.source.delete({ where: { id: source.id } });

  return new NextResponse(null, { status: 204 });
}
