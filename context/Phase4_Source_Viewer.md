# Phase 4 — Source Viewer (citation click-through)

## What was built

- `GET /api/sources/:id/content` (plan §7): serves original source content for every one of the 5 source types. PDF streams raw `application/pdf` bytes (so `react-pdf` can load the same URL directly); `TEXT`/`URL`/`YOUTUBE`/`VTT` return a small discriminated-union JSON payload (`SourceContentPayload`, `lib/sources/content.ts`).
- Every citation `[n]` chip and every "Sources used" list row is now clickable — clicking either opens the Source Viewer panel at the exact cited spot, for all 5 source types (plan Phase 4's milestone, verbatim).
- Five per-type viewer components, each opening at the precise locator stored on the chunk (plan §4.1) rather than an approximation:
  - `PdfSourceViewer` — `react-pdf`, jumps to `locator.page`, highlights the cited chunk's text within that page's own text layer.
  - `TextSourceViewer` — highlights `fullText.slice(charStart, charEnd)` exactly (no fuzzy matching needed — see Key decisions).
  - `UrlSourceViewer` — readable-preview paragraphs, scrolled + highlighted at `locator.paragraphIndex`.
  - `YoutubeSourceViewer` — embedded iframe seeked to `locator.startSec` via the embed URL's `start` param.
  - `TranscriptSourceViewer` — scrollable cue list, auto-scrolled + highlighted from `locator.cueIndex` through `locator.endSec`.
- `SourceViewerPanel` (rewritten from Phase 1's placeholder) dispatches to the correct viewer based on `citation.sourceType`, fetches non-PDF content once per `sourceId`, and shows loading/error states.
- Citation-click state (`activeCitation: Citation | null`) is owned by a new `WorkspacePanels` client component so `ChatPanel` (where citations are clicked) and `SourceViewerPanel` (where they open) can share it while remaining siblings in the workspace's 3-column CSS grid.

## Files created/modified

- `lib/sources/content.ts` — `SourceContentPayload` discriminated union (`text` | `url` | `youtube` | `vtt`), shared by the route and every non-PDF viewer.
- `app/api/sources/[id]/content/route.ts` — the content-serving route; branches on `source.type`, reuses `readSourceFile` (PDF/TEXT/VTT), re-runs `UrlAdapter.extract()` (URL), and reads `source.metadata`/`originUrl` (YOUTUBE).
- `components/sources/pdf-source-viewer.tsx`, `text-source-viewer.tsx`, `url-source-viewer.tsx`, `youtube-source-viewer.tsx`, `transcript-source-viewer.tsx` — the 5 per-type viewers.
- `components/sources/source-viewer-panel.tsx` — rewritten: fetches content, dispatches to the right viewer, close button, all loading/error/empty states.
- `components/notebook/workspace-panels.tsx` — new client component owning `activeCitation` state; renders `<ChatPanel>` + `<SourceViewerPanel>` as a Fragment (no wrapper DOM node, so both stay direct children of the workspace grid).
- `app/notebooks/[id]/page.tsx` — now renders `<WorkspacePanels>` instead of separately importing/rendering `ChatPanel`/`SourceViewerPanel`.
- `components/chat/citation-chip.tsx` — now a real `<button>` with `onOpen`, not a non-clickable placeholder.
- `components/chat/message-content.tsx`, `chat-message-list.tsx`, `chat-panel.tsx` — threaded an optional `onOpenCitation`/`onOpen` callback down from `ChatPanel` to every `CitationChip`.
- `components/chat/sources-used-list.tsx` — each "Sources used" row is now also a clickable button wired to the same callback (not required by the plan's wording, which only calls out citation chips, but it's the same click-through action and a near-zero-cost addition for the same UX benefit).
- `package.json` — added `react-pdf` (pinned to `10.1.0`, pulling in `pdfjs-dist@5.3.93` — see Key decisions for why this specific version, not the latest `10.4.1`/`5.4.296`).

## Key decisions & deviations

- **PDF highlighting matches against pdf.js's own text layer, not `unpdf`'s ingestion-time char offsets.** `unpdf` (ingestion) and `pdfjs-dist`/`react-pdf` (viewer) are different text-extraction code paths over the same PDF and are not guaranteed to produce identical per-character offsets (different internal item/whitespace joining). Rather than trust `locator.charStart`/`charEnd` directly against the viewer's text layer, `PdfSourceViewer` re-derives its own per-item character offsets from the *same* `getTextContent()` call `react-pdf` already makes to render the text layer (via the `onGetTextSuccess` callback, which fires synchronously before `customTextRenderer` is invoked per item — no race condition), then does a substring search for the cited chunk's `snippet` text within that page's own joined text. This is more robust than matching offsets across two different libraries, at the cost of being a text-match rather than an exact index — noting this as a deliberate deviation from the locator schema's `charStart`/`charEnd` being used literally in the PDF case (they're still used literally for the `TEXT` source type, where `TextAdapter` and the viewer both read the exact same `fullText` string, so no such mismatch exists there).
- **URL paragraph indices are re-derived by re-running `UrlAdapter.extract()` at request time, not cached from ingestion.** No extra schema/storage was added to persist the originally-extracted HTML/paragraphs; the content route just re-fetches and re-runs the same Readability pipeline. This means `paragraphIndex` alignment holds as long as the live page's content hasn't materially changed since ingestion — an accepted known limitation (flagged in both the route's and `UrlSourceViewer`'s doc comments) rather than adding a `Chunk`-adjacent "cached extracted content" table/column for a single-purpose preview feature.
- **VTT/Transcript highlighting uses `locator.cueIndex` as a direct array index into a fresh `parseVttOrSrt()` re-parse of the same file**, not a re-derived match. `VttAdapter` already records `cueIndex` as the raw cue array's index (`group.firstCueIndex`) at ingestion time (Phase 2), and re-parsing the same immutable stored file with the same deterministic parser reproduces the identical array — so, unlike the URL case, this one *is* an exact index-based match with no drift risk (the source file on disk never changes between ingestion and viewing).
- **`SourcesUsedList` rows were also made clickable**, beyond what the plan's Phase 4 bullet literally lists (only `CitationChip`). Both surfaces represent the same underlying `Citation` and both are natural click targets for "open this source" — treating them identically is a minor UX improvement, not a scope change (no new data/locator types involved).
- **`react-pdf`'s pdf.js worker is loaded from a CDN (`unpkg.com/pdfjs-dist@<version>/...`)** rather than self-hosted/bundled via webpack config. Avoids Next.js/Turbopack asset-copying configuration for `pdf.worker.min.mjs`; acceptable for this assignment's scope, though a production deployment might prefer self-hosting to avoid the runtime CDN dependency (noted as a Known issue below).
- **`PdfSourceViewer` is loaded via `next/dynamic(..., { ssr: false })` in `SourceViewerPanel`, not a plain import.** `pdfjs-dist` touches browser-only globals (`DOMMatrix`, `Path2D`, ...) at module-evaluation time; a plain import gets evaluated during SSR of the (client-component) page tree and crashes with `Object.defineProperty called on non-object` before ever reaching the browser. This was caught live (see Known issues) and fixed post-implementation — flagging it here since it's a real deviation from "just import the component" for every other viewer.
- **`react-pdf` is pinned to `10.1.0` (bundling `pdfjs-dist@5.3.93`), not the latest `10.4.1`.** After fixing the SSR crash above, clicking a PDF citation in the actual browser still crashed with the *same* error message but from a purely client-side import — this turned out to be an unrelated, separate bug: a known Webpack incompatibility (`webpack/webpack#20095`) where Next.js dev mode's default `eval-*` source-map `devtool` setting makes Webpack wrap newer `pdfjs-dist` ESM builds (5.4.x) with extra runtime that crashes at import time, regardless of SSR. The Webpack fix (5.103.0+) isn't in the Webpack version Next.js 15.5.21 bundles yet. Rather than force a custom `devtool` in `next.config.ts` (Next.js explicitly detects and reverts any dev-mode `devtool` override, per its own "improper devtool" warning, and disabling source maps entirely is a worse trade-off), pinning to `react-pdf@10.1.0` — reported by multiple people hitting the same upstream issue to sidestep it — avoids the bug without touching webpack config or losing dev source maps.
- **The content route does not gate on `source.status === "READY"`.** In practice a citation can only exist for a chunk that was successfully indexed, so its source is `READY` by construction; skipping an extra status check keeps the route simpler. If hit directly for a non-ready source, the relevant adapter call/file-read will itself throw a clear error, caught and returned as a `502` with a message — no silent failure.

## Environment variables added/used

None new. This phase's content route reuses the existing `readSourceFile` (local disk) and `UrlAdapter` (no new external API calls beyond what ingestion already made).

## How to verify the milestone

1. `docker compose up -d`, `npm run dev` (worker not required unless also re-indexing).
2. Sign in, open a notebook with at least one `READY` source of each type (Phase 2 left one with a PDF, pasted text, and a YouTube source in this environment; add a URL and a VTT/transcript source too if not already present, to exercise all 5).
3. Ask a question that should cite each type of source (or ask 5 targeted questions, one per source type).
4. For each assistant answer, click an inline `[n]` chip (or a row in "Sources used") and confirm:
   - **PDF** → viewer opens on the cited page, with the cited passage highlighted in yellow within the page's text.
   - **Text** → panel opens with the cited character range highlighted and scrolled into view.
   - **URL** → readable preview opens, scrolled to and highlighting the cited paragraph, with a link to the original page.
   - **YouTube** → embedded player loads seeked to the cited timestamp.
   - **VTT/Transcript** → cue list opens, auto-scrolled to and highlighting the cited cue(s).
5. Click the panel's close (`×`) button → returns to the "No source open" empty state.
6. Click a different citation while the panel is already open → panel updates in place (no flicker/full remount) to the new source/locator.
7. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly (verified in this session).

I verified steps 1 and 7 directly, plus a live sanity check that the dev server's new route enforces auth correctly (`GET /api/sources/:id/content` → `401 Unauthorized` when signed out, same pattern as every other protected route). What I could **not** drive from here is the actual signed-in browser click-through across all 5 source types (steps 3-6) — **please sign in and click through one citation of each source type to confirm the milestone end-to-end**, same caveat as every prior phase's context file. Pay particular attention to the PDF highlight (the one viewer using text-matching rather than an exact locator, per the Key decisions above) and the URL paragraph alignment (the one viewer that re-derives its locator target from a live re-fetch).

## Known issues / TODOs

- **Fixed during live verification (two separate bugs, same error message):**
  1. `PdfSourceViewer` initially crashed with `TypeError: Object.defineProperty called on non-object` because `pdfjs-dist` was evaluated during SSR. Fixed via `next/dynamic(..., { ssr: false })`.
  2. After that fix, clicking a real PDF citation in the browser hit the *same* error message again, this time client-side only — a Webpack/`pdfjs-dist@5.4.x` ESM interop bug triggered by Next.js dev mode's `eval-*` source maps. Fixed by pinning `react-pdf` to `10.1.0` (see Key decisions). Confirmed the dev server compiles `/notebooks/[id]` cleanly after both fixes and `npx tsc --noEmit`/`npm run lint` pass — **still needs one more click-through confirmation that opening a PDF citation now renders instead of crashing**, since the second fix was applied without a fresh signed-in browser click-through from this session.
  If Next.js's bundled Webpack version is ever upgraded past 5.103.0 (fixed upstream), `react-pdf` can likely be bumped back to latest without hitting this again.
- **PDF text highlighting is a best-effort substring match**, not a guaranteed hit — if a cited chunk's snippet happens to span an unusual PDF text-item boundary (e.g. a hyphenated word split oddly by the PDF's internal layout), the highlight may fail to render even though page navigation still works correctly. Acceptable given the cross-library offset mismatch this design avoids (see Key decisions); a hard failure here only means "no highlight," never a wrong highlight or a crash.
- **`react-pdf`'s pdf.js worker loads from a CDN at runtime** (`unpkg.com`) — an outage there would break PDF rendering even though the app itself is up. Fine for dev/assignment scope; worth self-hosting the worker file via `public/` if this becomes a real production deployment.
- **URL paragraph alignment can drift if the live page changes after ingestion** (see Key decisions) — no cached snapshot of the originally-extracted content is persisted. A future phase could add one if this proves to be a real problem in practice.
- **No "open in new tab"/download affordance** for the PDF or original URL beyond the URL viewer's existing external link — not required by the plan, could be added in Phase 5's polish pass.
- Carried over from Phases 0-3: `CLERK_WEBHOOK_SECRET` still unverified end-to-end; Google-only OAuth restriction still needs manual Clerk-dashboard confirmation; worker still runs via `tsx watch` (dev-only); no rate limiting yet (explicitly Phase 5's job).

## What the next phase needs from this one

- All 5 source types now have a complete, working click-through path from citation → correct viewer → correct locator — Phase 5's polish pass can focus on loading/empty/error-state consistency across panels and responsive collapse under `md`, without needing further Source Viewer feature work.
- `GET /api/sources/:id/content` is a new endpoint Phase 5's rate-limiting pass should include alongside chat/upload (it's a real per-click network+extraction call, cheaper than chat but not free — the URL branch re-fetches the live page and re-runs Readability on every open).
- `SourceContentPayload` (`lib/sources/content.ts`) is the stable contract between the content route and every viewer — any future addition to the Source Viewer (e.g. a "download original" button) should extend this type rather than inventing a parallel shape.
