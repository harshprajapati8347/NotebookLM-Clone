import { auth } from "@clerk/nextjs/server";

/**
 * Returns the current Clerk user id, or null if unauthenticated.
 *
 * Auth is enforced per-resource (not in Middleware — see middleware.ts),
 * so every protected API route must call this and return a 401 itself:
 *
 *   const userId = await requireUserId();
 *   if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
