import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/clerk";
import { prisma } from "@/lib/db/prisma";
import { ingestionQueue } from "@/lib/queue/ingestionQueue";
import { findOwnedSource, serializeSource } from "@/lib/sources/queries";

type RouteParams = { params: Promise<{ id: string }> };

/** Re-runs the full ingestion pipeline for an existing source (plan §2.2). */
export async function POST(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await findOwnedSource(id, userId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const updated = await prisma.source.update({
    where: { id: source.id },
    data: { status: "QUEUED", progress: 0, errorMessage: null },
  });

  await ingestionQueue.add("ingest", { sourceId: source.id });
  return NextResponse.json({ source: serializeSource(updated) }, { status: 202 });
}
