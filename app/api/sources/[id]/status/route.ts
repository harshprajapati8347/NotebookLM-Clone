import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/clerk";
import { findOwnedSource } from "@/lib/sources/queries";

type RouteParams = { params: Promise<{ id: string }> };

/** Lightweight poll target for the 2s status-polling UI (plan §8.3). */
export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await findOwnedSource(id, userId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: source.id,
    status: source.status,
    progress: source.progress,
    errorMessage: source.errorMessage,
  });
}
