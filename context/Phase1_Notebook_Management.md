# Phase 1 — Notebook Management

## What was built

- Full CRUD for notebooks: `POST/GET /api/notebooks`, `PATCH/DELETE /api/notebooks/:id`, each behind `requireUserId()` + an ownership check (`notebook.userId === userId`) before touching data.
- Dashboard at `/notebooks`: grid of `NotebookCard`s (title, description, source count, per-status badge summary), a "New notebook" button opening `CreateNotebookDialog`, and a friendly empty state when the user has zero notebooks.
- Per-card actions (dropdown menu → Rename / Delete) via `RenameNotebookDialog` and `DeleteNotebookConfirm` (destructive `AlertDialog`, explicitly warns that delete cascades sources/chunks/chat history).
- Workspace shell at `/notebooks/[id]`: header (back button, notebook title, the same rename/delete dropdown, theme toggle, `UserButton`) + a 3-pane layout (`SourcesPanel`, `ChatPanel`, `SourceViewerPanel`), all empty-state placeholders that later phases fill in. Collapses to a single stacked column under `md`.
- Ownership enforcement is real, not just UI-level: `/notebooks/[id]` calls `notFound()` if the notebook doesn't exist or belongs to a different user (verified by inspection of `getOwnedNotebookSummary`; same pattern the API routes use).
- Deleting a notebook exercises the schema's cascading FKs (`onDelete: Cascade` on `Source`, `Chunk`, `ChatSession`, `ChatMessage` from Phase 0's `schema.prisma`) — nothing new needed in Phase 1 beyond calling `prisma.notebook.delete`.

## Files created/modified

- `app/api/notebooks/route.ts` — `GET` (list current user's notebooks + summary), `POST` (create)
- `app/api/notebooks/[id]/route.ts` — `PATCH` (rename/description), `DELETE` (cascades)
- `lib/notebooks/validation.ts` — Zod schemas (`createNotebookSchema`, `updateNotebookSchema`)
- `lib/notebooks/types.ts` — `NotebookSummary` shared type (id/title/description/timestamps/sourceCount/statusCounts)
- `lib/notebooks/queries.ts` — `listNotebooksWithSummary`, `findOwnedNotebook`, `getOwnedNotebookSummary` (all enforce `userId` in the `where`, never trust a client-supplied id alone)
- `lib/auth/sync-user.ts` — extracted the Phase 0 "defensive Clerk→Postgres upsert" out of `app/notebooks/page.tsx` into a shared `ensureUserSynced()` helper so `/notebooks/[id]` can reuse it too
- `app/notebooks/page.tsx` — rewritten: header + `NotebooksDashboard` (server component fetches, client component owns interactive state)
- `app/notebooks/[id]/page.tsx` — new: workspace shell, ownership-checked via `getOwnedNotebookSummary`
- `components/notebook/notebooks-dashboard.tsx` — client; owns the notebooks array in state, renders grid/empty-state, wires `CreateNotebookDialog`
- `components/notebook/notebook-card.tsx` — one card; owns its own rename/delete dialog open-state
- `components/notebook/notebook-status-summary.tsx` — renders "`N sources` + status badges" or "No sources yet"
- `components/notebook/create-notebook-dialog.tsx`, `rename-notebook-dialog.tsx`, `delete-notebook-confirm.tsx` — each calls its own API route directly and reports success/failure via `sonner` toasts
- `components/notebook/notebook-workspace-header.tsx` — client; back link + rename/delete dropdown + theme/user controls for `/notebooks/[id]`
- `components/sources/sources-panel.tsx`, `components/chat/chat-panel.tsx`, `components/sources/source-viewer-panel.tsx` — Phase 1 empty-state placeholders for the 3-pane workspace (left/center/right), explicitly commented with which later phase replaces them

## Key decisions & deviations

- **Dashboard data flow is "server-fetch once, then client-owned state," not a client-side `GET` on mount.** `/notebooks/page.tsx` (server component) calls `listNotebooksWithSummary()` directly via Prisma and passes the result as `initialNotebooks` into the client `NotebooksDashboard`, which then mutates its own local array in response to create/rename/delete API calls (no refetch/`router.refresh()` needed). The `GET /api/notebooks` route still exists per the plan's API table and is fully functional (e.g. for future non-page consumers), it's just not what the dashboard itself calls on load — this avoids a redundant network round-trip on first paint.
- **`NotebookSummary.statusCounts` is a real per-status `groupBy` query against `Source`**, wired end-to-end now even though no sources exist until Phase 2 (so it's always `{}` today). Decided to build the real query now rather than a stub, since the shape plan §2.1 asks for ("status summary") is exactly this and it's a two-line addition once `Source` rows exist.
- **Delete confirmation explicitly names what cascades** ("sources, chunks, and chat history") rather than a generic "are you sure?" — no schema/architecture impact, just a UX choice to make the irreversible action's blast radius clear upfront, since Phase 2+ will make notebooks contain real, possibly-large ingested content.
- **Extracted `ensureUserSynced()` into `lib/auth/sync-user.ts`** (was inline in `app/notebooks/page.tsx` from Phase 0) so `/notebooks/[id]/page.tsx` doesn't duplicate it. Pure refactor, no behavior change; still a stopgap until the Clerk webhook is verified end-to-end (see Phase 0's Known Issues, unchanged).
- **Workspace 3-pane grid uses fixed pixel side-columns (`280px`/`300px`) with a fluid center**, not fractional columns, so the chat panel — the eventual focal point — always gets the remaining space regardless of viewport width. Collapses to a single stacked column below `md` per plan §8.3; true "collapse to tabs" behavior is deferred until the panels have real content worth tabbing between (Phase 2+ makes this decision concrete).
- No new environment variables or schema changes were needed this phase — everything reuses Phase 0's `prisma`, `requireUserId()`, and data model as-is.

## Environment variables added/used

None new. Continues to use `DATABASE_URL` and the Clerk vars from Phase 0.

## How to verify the milestone

1. `docker compose up -d` (Postgres/Redis already running is fine) and `npm run dev`.
2. Sign in with Google, land on `/notebooks` — should show the "No notebooks yet" empty state (or your existing notebooks if you already created any while testing).
3. Click **New notebook**, give it a title (+ optional description) → it appears immediately at the top of the grid, toast confirms creation.
4. Confirm in Postgres: `docker exec notebooklm-postgres psql -U notebooklm -d notebooklm -c 'select id, title, "userId" from "Notebook";'` — row should exist with your Clerk `userId`.
5. Click the card's `⋮` menu → **Rename** → change the title/description → save → card updates in place, toast confirms.
6. Click the card itself (not the menu) → lands on `/notebooks/[id]`, shows the header with the (possibly renamed) title, and the empty Sources/Chat/Source-viewer panels side by side (stacked on narrow viewports).
7. From the workspace header's `⋮` menu, or back on the dashboard card menu, click **Delete** → confirm in the destructive alert dialog → notebook disappears from the dashboard (or, if deleted from the workspace page, you're redirected back to `/notebooks`).
8. Confirm cascade: re-run the psql query from step 4 — the row is gone. (Once Phase 2 exists, this step should also confirm `Source`/`Chunk` rows for that notebook are gone.)
9. Try opening someone else's/a nonexistent notebook id directly (`/notebooks/does-not-exist`) — should 404, not leak data.
10. `npm run build` and `npm run lint` both pass cleanly (verified in this session).

I verified steps 1, 4 (schema/query shape), 9 (via `getOwnedNotebookSummary`'s `where: { id, userId }` + `notFound()` logic inspection), and 10 directly. Steps 2–3 and 5–8 require driving the actual signed-in browser UI, which I can't do from here — **please click through create → rename → open workspace → delete once to confirm the milestone end-to-end**, same caveat as Phase 0.

## Known issues / TODOs

- Same Phase 0 carry-overs: `CLERK_WEBHOOK_SECRET` still unset (defensive upsert covers it for now); Google-only restriction still needs manual confirmation in the Clerk dashboard.
- No rate limiting or input sanitization beyond Zod's length/required checks yet — plan §5's Phase 5 covers rate limiting explicitly; not needed yet since there's no expensive/abusable operation in Phase 1.
- No dedicated `not-found.tsx` for `/notebooks/[id]` yet — falls back to Next's default not-found page. Fine for now; can be styled in Phase 5's polish pass if desired.
- `NotebookCard`'s status badges are wired but untested with real data since no `Source` rows exist until Phase 2 — worth a quick visual check once Phase 2 lands.

## What the next phase needs from this one

- `SourcesPanel` (`components/sources/sources-panel.tsx`) is the exact placeholder Phase 2 replaces with the real source list, `AddSourceDialog` trigger, and `SourceListItem` with 2s status polling — the panel's outer layout/border classes are already correct for its grid slot, only the inner content needs replacing.
- `getOwnedNotebookSummary(notebookId, userId)` (`lib/notebooks/queries.ts`) is the ownership-checked lookup Phase 2's `/api/notebooks/:id/sources` routes should reuse (or a sibling of it) before accepting an upload/registration for that notebook.
- `NotebookSummary.statusCounts` / `sourceCount` are already live queries against `Source` — Phase 2 doesn't need to build this aggregation, just start writing `Source` rows and it'll populate correctly.
- The 3-pane grid in `app/notebooks/[id]/page.tsx` is where Phase 2 (`SourcesPanel`), Phase 3 (`ChatPanel`), and Phase 4 (`SourceViewerPanel`) each slot in — no layout changes should be needed, just swapping placeholder content for real components.
