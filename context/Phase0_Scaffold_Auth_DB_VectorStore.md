# Phase 0 — Scaffold, Auth, DB, Vector Store

## What was built

- A Next.js 15 (App Router, TypeScript, Tailwind v4) app scaffolded at the project root, with shadcn/ui (Radix base, Nova preset) and `next-themes` for dark/light mode wired in.
- Prisma + Postgres set up with the exact data model from plan §4 (`User`, `Notebook`, `Source`, `Chunk`, `ChatSession`, `ChatMessage`, `IngestionJob`), first migration applied.
- Clerk auth wired end-to-end: `middleware.ts` protects everything except `/` and the webhook, a `user.created`/`user.updated`/`user.deleted` webhook syncs into Postgres `User`, and `/notebooks` also does a belt-and-suspenders upsert on page load (see Deviations).
- Qdrant client + `notebook_chunks` collection (1536-d, Cosine) created against a **real Qdrant Cloud** instance, with payload indexes on `notebookId`, `sourceId`, `sourceType`.
- Redis + BullMQ connection wired (`lib/queue/connection.ts`, `ingestionQueue.ts`, `ingestionWorker.ts`) — queue exists and a stub worker can start, but nothing is enqueued/processed yet (that's Phase 2).
- Local dev infra via `docker-compose.yml` (Postgres, Redis, Qdrant) for anyone without cloud accounts for the DB/queue.

## Files created/modified

- `app/layout.tsx` — `ClerkProvider` + `ThemeProvider` + `Toaster` root wiring
- `app/page.tsx` — public landing page with Google sign-in button; redirects to `/notebooks` if already signed in
- `app/notebooks/page.tsx` — empty-state dashboard placeholder (Phase 1 replaces the body); also upserts the Clerk user into Postgres defensively
- `app/api/webhooks/clerk/route.ts` — verifies Svix signature, upserts/deletes `User` rows on Clerk events
- `middleware.ts` — `clerkMiddleware()` guarding all routes except `/` and `/api/webhooks/clerk`
- `lib/auth/clerk.ts` — `requireUserId()` helper for route handlers (used starting Phase 1)
- `lib/db/prisma.ts` — Prisma client singleton
- `lib/qdrant/client.ts` — Qdrant client singleton
- `lib/qdrant/collections.ts` — `ensureNotebookChunksCollection()`, idempotent
- `scripts/setup-qdrant.ts` — CLI entry point (`npm run qdrant:setup`) for the above
- `lib/queue/connection.ts` — shared ioredis connection for BullMQ
- `lib/queue/ingestionQueue.ts` — `source-ingestion` BullMQ queue definition
- `lib/queue/ingestionWorker.ts` — stub worker (logs and no-ops; real pipeline in Phase 2)
- `prisma/schema.prisma` — full data model per plan §4
- `docker-compose.yml` — local Postgres/Redis/Qdrant for dev
- `components/theme-provider.tsx`, `components/theme-toggle.tsx`
- `.env.example`, `.env` (gitignored; filled with real Clerk/OpenAI/Cohere/Qdrant Cloud keys that were already present in the environment, plus local Docker connection strings for `DATABASE_URL`/`REDIS_URL`)
- `README.md` — local setup instructions (will expand in Phase 5)

## Key decisions & deviations

- **Prisma major version pinned to v6, not the latest v7.** `npx prisma init` pulled Prisma 7 by default, which requires moving `datasource.url` out of `schema.prisma` into `prisma.config.ts` and using driver adapters for `PrismaClient`. That's a significant, unnecessary architecture change relative to the plan's assumption of a standard `prisma-client-js` setup, so I pinned `prisma`/`@prisma/client` to `6.x` (stable, classic `datasource { url = env(...) }` style) instead of adapting the whole project to Prisma 7's new adapter model. Noting this so it's a deliberate choice, not an oversight.
- **Next.js pinned to 15.5.21, React pinned to 18.3.1.** `create-next-app@latest` installed Next 16 / React 19 by default; the plan explicitly specifies Next.js 15, so I downgraded immediately after scaffolding, along with matching `eslint-config-next` and `@types/react*` versions.
- **shadcn/ui base library: Radix (not the new "Base UI" default).** The shadcn CLI now defaults to prompting for a component base (`base`, `radix`, `aria`); I chose Radix since it's the long-standing, most broadly-documented option and matches what most shadcn/ui usage the ecosystem (and likely your familiarity) assumes. Preset used: `nova` (Lucide icons + Geist font, which the scaffold already uses).
- **`eslint.config.mjs` rewritten to use `FlatCompat`.** The generated flat config imported `eslint-config-next/core-web-vitals` (no extension) which doesn't resolve under Node ESM with this package's export map, and separately `eslint-config-next` 15.5.21 ships legacy-style (`extends: [...]`) configs, not flat-config arrays. Rewrote to the standard `@eslint/eslintrc` `FlatCompat` bridge that `create-next-app` itself normally generates for this exact situation, and added explicit ignores for `.next/`, `lib/generated/`, etc. (lint was otherwise trying to lint the compiled `.next` output).
- **`/notebooks` page defensively upserts the current user into Postgres**, in addition to the Clerk webhook. Locally there's no public URL for Clerk to call the webhook against, so relying solely on the webhook would leave `User` rows missing in local dev until a tunnel (ngrok, etc.) is set up. This mirrors a common Clerk+Prisma pattern and doesn't change any schema/architecture — Phase 1 can drop this once the webhook is verified end-to-end in a deployed/tunneled environment, or keep it as a safety net.
- **Real credentials were already present in the environment.** `.env` was pre-populated (by the workspace) with a live Clerk dev instance, a live Qdrant Cloud cluster, an OpenAI key, and a Cohere key. I used these directly rather than stubbing placeholders, and only filled in `DATABASE_URL` / `REDIS_URL` (pointed at the local Docker Compose services) and `NEXT_PUBLIC_APP_URL`. `CLERK_WEBHOOK_SECRET` is still empty — see Known Issues.
- **Migrated off `createRouteMatcher` + middleware-level `auth.protect()` to Clerk's resource-based auth model.** The installed `@clerk/nextjs@7.6.1` deprecates middleware path-matching auth gates in favor of per-resource checks (Clerk cites real Middleware-bypass CVEs, e.g. `GHSA-vqx2-fgx2-5wq9`, as the motivation — see [migration guide](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher)). This deviates from plan §9's literal wording ("`middleware.ts` uses `clerkMiddleware()` to protect `/notebooks/**` and `/api/**`"), but achieves the same *intent* (every route behind auth) more robustly:
  - `middleware.ts` now just calls bare `clerkMiddleware()` (still required for Clerk to function; no more path-matching auth gate there).
  - `/notebooks/page.tsx` already had its own resource-level guard (`currentUser()` + `redirect("/")` if signed out) — no change needed there.
  - `lib/auth/clerk.ts`'s `requireUserId()` now returns `string | null` instead of throwing, so every Phase 1+ API route handler is expected to call it and return its own `401 Unauthorized` JSON response — this is literally the same "ownership check at the API layer" §7 already required, just now also carrying the base authentication check instead of assuming middleware already did it.
  - Net effect: **stronger** isolation guarantee than the plan's literal wording, not weaker — every resource checks itself rather than trusting a single path-matched gate.
- Left `docker-compose.yml`'s `qdrant` service defined for anyone who wants a fully local stack, even though the actual `.env` currently points `QDRANT_URL` at Qdrant Cloud.

## Environment variables added/used

All of §11 are declared in `.env` / `.env.example`. As of Phase 0:

- **Used and live:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `QDRANT_URL`, `QDRANT_API_KEY`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL`
- **Declared but not yet exercised by code:** `OPENAI_API_KEY`, `COHERE_API_KEY` (Phase 2/3), `S3_*` (Phase 2, only needed if/when moving off local disk storage)
- **Empty, needs manual setup:** `CLERK_WEBHOOK_SECRET` (see Known Issues)

## How to verify the milestone

1. `docker compose up -d` — starts local Postgres + Redis (+ optional local Qdrant, unused since `.env` points at Qdrant Cloud).
2. `npx prisma migrate dev` — already applied; re-running is a no-op. Confirms tables: `docker exec notebooklm-postgres psql -U notebooklm -d notebooklm -c "\dt"` should list `User`, `Notebook`, `Source`, `Chunk`, `ChatSession`, `ChatMessage`, `IngestionJob`.
3. `npm run qdrant:setup` — already run against the live Qdrant Cloud cluster; confirms/creates the `notebook_chunks` collection (1536-d, Cosine, with `notebookId`/`sourceId`/`sourceType` payload indexes).
4. `npm run dev`, open `http://localhost:3000`.
5. Click **Sign in with Google** → complete the Google OAuth flow in the Clerk modal.
6. You should land on `/notebooks`, which shows the "No notebooks yet" empty state and your signed-in email.
7. Confirm your user landed in Postgres: `docker exec notebooklm-postgres psql -U notebooklm -d notebooklm -c 'select id, email from "User";'`.
8. `npm run build` and `npm run lint` both pass cleanly (verified).

I was able to verify steps 1–4 and 8 directly (containers up, migration applied, tables present, Qdrant collection confirmed via the client, build/lint clean, dev server serving `/` with the sign-in button and blocking `/notebooks` when signed out). Step 5–7 (actually completing Google OAuth) requires a real interactive browser session, which I could not drive from here — **please complete that manually to confirm the milestone end-to-end.**

## Known issues / TODOs

- `CLERK_WEBHOOK_SECRET` is unset. To wire the webhook locally you'd need a public tunnel (ngrok or similar) pointed at `/api/webhooks/clerk`, registered in the Clerk dashboard. Since `/notebooks` already upserts the user defensively, this isn't blocking, but the webhook path itself is currently unverified end-to-end.
- **Google-only OAuth restriction in Clerk must be verified/set in the Clerk dashboard manually** — this is a dashboard configuration action outside of what code/CLI can enforce, and I don't have dashboard access from here. Please confirm in the Clerk dashboard that only Google is enabled as a sign-in method (email/password and other socials disabled).
- The BullMQ worker (`lib/queue/ingestionWorker.ts`) is a stub that only logs — no processor is started anywhere yet (no `start` script calls it). That's intentional per the plan ("queue not used yet, just wired"); Phase 2 will add the real worker entry point and start it (e.g. via a separate `worker` npm script or a long-running process).
- No file storage (local disk / S3) wiring yet — deferred to Phase 2 per the plan.

## What the next phase needs from this one

- `prisma` client (`lib/db/prisma.ts`) and the full schema are ready for `Notebook` CRUD.
- `requireUserId()` (`lib/auth/clerk.ts`) is the pattern Phase 1's API routes should use for the ownership-check layer described in plan §7 (`notebook.userId === auth().userId`).
- `/notebooks/page.tsx`'s empty-state body is expected to be replaced by Phase 1's real dashboard (`NotebookCard`, `CreateNotebookDialog`, etc.) — the header (theme toggle + `UserButton`) and the defensive user-sync should probably be preserved/refactored into a shared layout rather than deleted.
- shadcn components already installed and ready to use: `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `textarea`, `badge`, `avatar`, `separator`, `scroll-area`, `sonner`, `tabs`, `alert-dialog`, `skeleton`. Add more via `npx shadcn@latest add <component>` as needed.
