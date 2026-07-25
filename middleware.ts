import { clerkMiddleware } from "@clerk/nextjs/server";

// `clerkMiddleware()` is still required for Clerk to work correctly, but the
// actual auth gate lives on each resource (pages via `currentUser()`/redirect,
// API routes via `requireUserId()`), per Clerk's resource-based auth guidance:
// https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher
// This avoids the class of Middleware path-matching bypass Clerk deprecated
// `createRouteMatcher()`-based gating over.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
