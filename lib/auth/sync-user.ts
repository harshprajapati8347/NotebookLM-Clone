import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

/**
 * Phase 0 safety net: syncs the signed-in Clerk user into Postgres so the
 * rest of the schema's FKs resolve even before the Clerk webhook is
 * reachable (e.g. no public URL yet in local dev). Redirects to "/" if
 * unauthenticated. Shared by every page under /notebooks.
 */
export async function ensureUserSynced() {
  const user = await currentUser();
  if (!user) {
    redirect("/");
  }

  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) return user;

  await prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: primaryEmail,
      name: user.fullName,
      imageUrl: user.imageUrl,
    },
    update: {
      email: primaryEmail,
      name: user.fullName,
      imageUrl: user.imageUrl,
    },
  });

  return user;
}
