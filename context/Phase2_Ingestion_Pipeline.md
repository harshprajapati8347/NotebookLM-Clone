# Phase 2 — Full Ingestion Pipeline (all 5 source types)

## What was built

- All 5 source adapters (`PdfAdapter`, `TextAdapter`, `UrlAdapter`, `YoutubeAdapter`, `VttAdapter`) behind the shared `SourceAdapter` interface from plan §6 — each turns a `Source` row into a `RawDocument` (`fullText` + locator-tagged `segments`).
- A token-bounded, locator-aware `chunker.ts` (~500 target / 600 max tokens via `js-tiktoken`'s `cl100k_base` encoding, ~15% segment-granularity overlap) and `embed.ts` (OpenAI `text-embedding-3-small`, batched).
- The real BullMQ pipeline: `lib/ingestion/pipeline.ts`'s `processSource(sourceId)` does extract → chunk → embed → upsert into Qdrant (namespaced by `notebookId`) → write `Chunk` rows → update `Source.status`/`progress`, wired into `lib/queue/ingestionWorker.ts` (replacing the Phase 0 no-op stub) and run as its own long-lived process via `npm run worker` (`scripts/worker.ts`).
- Deterministic Qdrant point ids (`uuid5("sourceId:chunkIndex")`, `lib/qdrant/pointId.ts`) — re-indexing wipes a source's prior `Chunk` rows + Qdrant points up front, so repeated runs never leave stale/duplicate vectors regardless of whether the new run produces more or fewer chunks.
- All 5 API routes from plan §7 for this phase: `POST/GET /api/notebooks/:id/sources` (register — multipart for PDF/VTT/optional TEXT-as-file, JSON for URL/YOUTUBE/pasted TEXT), `GET /api/sources/:id/status` (poll target), `POST /api/sources/:id/reindex`, `DELETE /api/sources/:id` (cascades chunks via the schema's FK + explicitly wipes Qdrant points and the on-disk file).
- Local disk file storage (`lib/storage/local.ts`) under a new gitignored `/storage` root, path-traversal-guarded, keyed by `storage/{notebookId}/{sourceId}/{filename}`.
- Frontend: `AddSourceDialog` (5 tabs — PDF, Paste Text, Website URL, YouTube, Transcript upload), `SourceListItem` (type icon, status badge incl. live `Indexing X%`, 2s self-polling while `QUEUED`/`INDEXING`, re-index/remove dropdown), and `SourcesPanel` rewritten from Phase 1's placeholder into a real client component fed by a server-fetched `initialSources` list (same "server-fetch once, client-owned state" pattern as the Phase 1 dashboard).

## Files created/modified

- `lib/adapters/types.ts` — `Locator` (plan §4.1), `RawSegment`, `RawDocument`, `SourceAdapter` interface, `AdapterError`
- `lib/adapters/pdfAdapter.ts` — per-page extraction via `unpdf`'s `extractText(pdf, {mergePages:false})`
- `lib/adapters/textAdapter.ts` — pasted text (from `Source.metadata.pastedText`) or uploaded `.txt`, paragraph-split with running char offsets
- `lib/adapters/urlAdapter.ts` — fetch → `@mozilla/readability` (via `jsdom`) extraction → `cheerio` paragraph split; raw `<body>`-strip fallback if Readability finds nothing (plan §14 risk mitigation)
- `lib/adapters/youtubeAdapter.ts` + `extractYoutubeVideoId` — resolves `videoId` from watch/`youtu.be`/embed/shorts URLs, `youtube-transcript`'s `fetchTranscript`, YouTube oEmbed for title/channel; explicit "no captions available" `AdapterError` on transcript failure
- `lib/adapters/vttAdapter.ts` + `lib/adapters/vttParser.ts` — hand-rolled WebVTT/SRT cue parser (no external dependency; both timestamp formats and inline `<tag>` stripping handled)
- `lib/adapters/cueMerge.ts` — shared "merge cues into ~45s groups" logic used by both `YoutubeAdapter` and `VttAdapter`
- `lib/adapters/index.ts` — `getAdapterForType(type)` registry
- `lib/ingestion/chunker.ts` — `chunkSegments()`, `countTokens()`; oversized-segment splitting + first/last-segment locator merge
- `lib/ingestion/embed.ts` — `embedTexts()`/`embedText()`, OpenAI client singleton
- `lib/ingestion/pipeline.ts` — `processSource(sourceId)`, the actual orchestration called by the worker
- `lib/queue/ingestionWorker.ts` — rewritten from Phase 0's stub to call `processSource`
- `scripts/worker.ts` — long-running worker process entry point (`npm run worker` → `tsx watch scripts/worker.ts`)
- `lib/qdrant/pointId.ts` — `deterministicPointId(sourceId, chunkIndex)`
- `lib/qdrant/points.ts` — `upsertChunkPoints()`, `deleteSourcePoints()`
- `lib/storage/local.ts` — `saveSourceFile`, `readSourceFile`, `deleteSourceFiles`
- `lib/sources/types.ts`, `lib/sources/validation.ts`, `lib/sources/queries.ts` — `SourceSummary` shape, Zod schemas for link/pasted-text registration + file MIME/size limits, ownership-checked `findOwnedSource`/`listSourcesForNotebook`
- `app/api/notebooks/[id]/sources/route.ts` — `GET` (list) / `POST` (register — branches on `Content-Type` for multipart vs JSON)
- `app/api/sources/[id]/route.ts` — `DELETE`
- `app/api/sources/[id]/status/route.ts` — `GET`
- `app/api/sources/[id]/reindex/route.ts` — `POST`
- `components/sources/add-source-dialog.tsx`, `components/sources/source-list-item.tsx`, `components/sources/sources-panel.tsx` (rewritten) — the Phase 2 frontend
- `app/notebooks/[id]/page.tsx` — now server-fetches `listSourcesForNotebook(id)` and passes it + `notebookId` into `SourcesPanel`
- `package.json` — added `openai`, `unpdf`, `cheerio`, `@mozilla/readability`, `jsdom`, `youtube-transcript`, `js-tiktoken`, `uuid` (+ `@types/jsdom`, `@types/uuid`), new `worker` script
- `.gitignore` — added `/storage`

## Key decisions & deviations

- **`youtube-transcript`'s `offset`/`duration` are in milliseconds, not seconds** — caught this only via live verification (see below): an 18-second video was initially recorded with `endSec: 18881`. Fixed by dividing by 1000 in `youtubeAdapter.ts` before building locators. Worth flagging since it's exactly the kind of unit bug that silently produces "technically working, subtly wrong" citations — glad the verification script caught it before Phase 4 builds on top of it.
- **Chunk-level locator merging uses the first and last segment in the chunk, not a computed union across every segment inside it.** For `pdf`/`text`/`youtube`/`vtt` this gives a correct contiguous range (or falls back to just the first segment's locator if a chunk happens to straddle a `pdf` page boundary, since a single `page` field can't represent two pages — rare given ~500-token chunks vs. typical page length). For `url`, `paragraphIndex` is a single discrete anchor by definition, so a merged chunk always anchors to its first paragraph. Noting this as a deliberate simplification over a more elaborate "range of ranges" locator schema, which the plan's §4.1 schema doesn't ask for anyway.
- **Overlap between chunks is segment-granularity (~15% of a chunk's segment count carried into the next chunk), not an exact token-level text slice.** Simpler to reason about and to keep locators clean (every chunk's locator still exactly matches real segment boundaries), at the cost of overlap not being a precisely-15%-of-tokens window. Given segments are already fairly small (paragraphs/pages/~45s cue groups), this is a reasonable approximation of the plan's "~400-600 tokens, ~15% overlap" spec.
- **Oversized single segments (e.g. a very dense PDF page) are split by word-count proportion before bucketing.** For `pdf`/`text`, char offsets are recomputed per slice via `indexOf` so citations stay precise even after splitting; for `url`/`youtube`/`vtt` (whose locator is a discrete anchor rather than something derived from the segment's own text length) every slice keeps the parent segment's locator — an accepted precision loss for what should be a rare case (a >600-token single paragraph/cue-group).
- **VTT/SRT parsing is a small hand-rolled regex parser (`lib/adapters/vttParser.ts`), not an external dependency.** Both timestamp formats (`HH:MM:SS.mmm` WebVTT and `HH:MM:SS,mmm` SRT) are simple enough that a ~50-line parser avoided pulling in and vetting a third-party subtitle-parsing package.
- **URL extraction has a two-tier fallback**: Readability (via `jsdom`) first; if it returns no content (parse failure or an atypical page), fall back to a raw `cheerio` strip-and-extract over `<body> p/li/h1-3` with a 20-char-minimum filter. Matches plan §14's stated risk mitigation ("Readability extraction with a raw text-strip fallback if it fails") directly.
- **Re-indexing is idempotent by construction**: `processSource()` always deletes a source's existing `Chunk` rows and Qdrant points (filtered by `sourceId`) *before* re-extracting, rather than relying solely on deterministic point ids to overwrite in place. This correctly handles the case where a re-run produces *fewer* chunks than the previous run (deterministic ids alone would leave the previously-higher-indexed points orphaned).
- **`processSource` re-throws after recording `Source.status = FAILED`.** The user-facing failure state is visible immediately (first attempt), but the error still propagates so BullMQ's queue-level retry/backoff (3 attempts, exponential, from Phase 0's `ingestionQueue.ts`) still applies underneath — a transient failure (e.g. a flaky URL fetch) gets an automatic retry even though the UI already showed "Failed" briefly.
- **`AddSourceDialog` uses 5 tabs** (PDF / Paste Text / Website URL / YouTube / Transcript) rather than the plan §8.2 wording's literal "Upload PDF/Text, Paste Text, Website URL, YouTube URL, Upload VTT" (which reads as 5 tabs but bundles "Upload PDF" and "Upload Text" together in one label). Splitting PDF and VTT/text-paste into their own dedicated tabs is clearer UI for 5 genuinely different input shapes (file vs. URL vs. textarea) and still covers all 5 required source types 1:1 with a tab each.
- **A `.txt` file upload path exists in the file-upload branch's type validation (`TEXT` is in `FILE_SOURCE_TYPES`) but `AddSourceDialog` doesn't expose a "Text file" tab** — only "Paste Text" (JSON/`pastedText`). The API route supports both; the UI currently only exercises the paste path. Cheap to add a small file-upload variant to the Text tab later if wanted; not required by the plan (which lists "Paste or `.txt` upload" as one extraction method, and paste is exercised end-to-end).
- **The `IngestionJob` Prisma model (plan §4) is not used.** `Source.status`/`Source.progress` are updated directly by `processSource()`, which is simpler and is what the UI actually polls (`GET /api/sources/:id/status`); BullMQ's own job records already provide attempt/retry bookkeeping, so a parallel `IngestionJob` table would be redundant given this phase's scope. Flagging as a deviation per the workflow rule rather than silently dropping it — the table still exists in the schema (harmless) in case a later phase wants per-attempt history.
- **File uploads accept up to 25MB** (`MAX_FILE_SIZE_BYTES`) and MIME-check against a permissive allow-list per type (`lib/sources/validation.ts`) — enough to satisfy plan §10's "validate uploaded file MIME/size" without over-engineering; no antivirus/content-sniffing beyond that.
- **`npm run worker` uses `tsx watch`** (auto-restart on file change) since this is still a dev-phase convenience; a production deployment (Phase 5) would run the compiled/plain `tsx scripts/worker.ts` (or a compiled JS entry) as a long-lived process instead.

## Environment variables added/used

- **Newly exercised:** `OPENAI_API_KEY` (embeddings via `lib/ingestion/embed.ts`) — was declared but unused since Phase 0.
- **Still declared, not yet used:** `COHERE_API_KEY` (Phase 3 rerank), `S3_*` (only if/when moving off local disk storage).
- No new variables were added to `.env.example`; the ones this phase needed were already present.

## How to verify the milestone

1. `docker compose up -d` (Postgres + Redis + Qdrant, or point `.env` at cloud services as already configured).
2. In one terminal: `npm run dev`. In a second terminal: `npm run worker` — you should see `[worker] ingestion worker started, waiting for jobs...`.
3. Sign in, open a notebook, click **Add** in the Sources panel.
4. **PDF tab** → choose a `.pdf` file → Add source. Watch the list item go `Queued → Indexing X% → Ready` (polls every 2s automatically).
5. **Paste Text tab** → paste a few paragraphs → Add source → same status progression.
6. **Website URL tab** → paste any article URL → Add source → same progression.
7. **YouTube tab** → paste a YouTube URL for a video *with captions* → Add source → same progression. (If the video has no captions, it should land on `Failed` with a clear "No captions available" message, not a generic error — click **Re-index** to retry after picking a captioned video.)
8. **Transcript tab** → upload a `.vtt` or `.srt` file → Add source → same progression.
9. For any `Ready` source, confirm in Postgres:
   ```sql
   select id, type, status, progress from "Source" where "notebookId" = '<id>';
   select "sourceId", "chunkIndex", "tokenCount", locator from "Chunk" where "notebookId" = '<id>';
   ```
   — every `Source` type has ≥1 `Chunk` row with a locator matching its kind (`page` for pdf, `charStart/charEnd` for text, `paragraphIndex` for url, `startSec/endSec` for youtube/vtt).
10. Confirm in Qdrant (e.g. via the dashboard at your `QDRANT_URL`, collection `notebook_chunks`): points exist with `payload.notebookId` matching this notebook and `payload.sourceId` matching each source — scoped correctly, no cross-notebook leakage.
11. Click a source's `⋮` menu → **Re-index** → status resets to `Queued` → `Indexing` → `Ready` again; confirm the `Chunk` row count/`vectorPointId`s are fresh (old ones are wiped first, not merely overwritten).
12. Click **Remove** on a source → confirm it disappears from the list, its `Chunk` rows are gone (`select * from "Chunk" where "sourceId" = '<id>'` → empty), and its Qdrant points are gone.
13. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass cleanly (verified in this session).

I directly verified the entire pipeline (steps 9-12's underlying logic) for **all 5 source types** via a throwaway Node script that created real `Source` rows, enqueued real BullMQ jobs, waited for the real worker to process them, and inspected the resulting `Chunk` rows + Qdrant points — including a real network fetch for the URL adapter (`example.com`) and a real YouTube transcript fetch (`jNQXAC9IVRw`, "Me at the zoo", chosen because it's guaranteed to have captions and is only 19s long, making the run fast). This is exactly how the youtube-transcript-returns-milliseconds bug (see Deviations) was caught and fixed before it could reach Phase 3/4. What I could **not** drive from here is the actual browser UI (steps 3-8, 11-12's click-through) — **please click through adding one of each source type and confirm the status chips update live, plus one re-index and one remove, to confirm the milestone end-to-end.**

## Known issues / TODOs

- **`AddSourceDialog`'s Text tab only supports paste, not `.txt` file upload**, even though the API route accepts a `TEXT` file upload too (see Deviations). Small UI addition if wanted.
- **No malware/content scanning on uploaded files** beyond size + MIME-type header check (which a malicious client can spoof) — acceptable for this assignment's scope per plan §10, but worth knowing it's not a hard security boundary.
- **PDF adapter has no OCR fallback** — a scanned/image-only PDF with no embedded text layer will fail extraction with a clear `AdapterError` ("may be scanned/image-only") rather than silently producing an empty source; this is intentional (no OCR dependency was in scope) but means such PDFs are simply unsupported.
- **YouTube adapter has no explicit handling for age-restricted/region-locked/private videos** beyond whatever error `youtube-transcript` itself throws — those will surface as a generic `AdapterError` message rather than a specifically-worded one. Low priority since captions-disabled is the main documented failure mode from plan §14 and *is* handled with a clear message.
- **Worker runs via `tsx watch`**, fine for local dev; Phase 5's deployment step should switch this to a plain long-lived process (no watch-mode restart) for production.
- Carried over from Phase 0/1: `CLERK_WEBHOOK_SECRET` still unverified end-to-end; Google-only OAuth restriction still needs manual Clerk-dashboard confirmation.

## What the next phase needs from this one

- **`Chunk` rows are now real** (`text`, `locator`, `tokenCount`, `vectorPointId`, `notebookId`, `sourceId`, `chunkIndex`) and **Qdrant points exist** with the exact payload shape from plan §4.2 (`notebookId`, `sourceId`, `sourceType`, `locator`, `text`, plus `chunkIndex`) — Phase 3's `retrieve.ts` can filter-search directly against `lib/qdrant/client.ts`'s `qdrant` singleton + the `NOTEBOOK_CHUNKS_COLLECTION` constant (`lib/qdrant/collections.ts`) with a mandatory `notebookId` payload filter, exactly as plan §3/§10 requires for the isolation boundary.
- **`lib/ingestion/embed.ts`'s `embedText()`/`embedTexts()`** is the same embedding call Phase 3 should reuse to embed the user's question (same model, same dimensionality) — don't duplicate an OpenAI client.
- **The `Locator` type (`lib/adapters/types.ts`)** is the exact citation-locator shape stored on every `Chunk`/Qdrant point; Phase 3's citation objects (`{sourceId, locator, snippet}`) and Phase 4's Source Viewer click-through both consume this type as-is — no transformation needed between ingestion and query/viewer.
- **`SourceSummary` (`lib/sources/types.ts`)** and `listSourcesForNotebook`/`findOwnedSource` (`lib/sources/queries.ts`) are ready for Phase 3's chat route to validate "does this notebook have any `READY` sources" (for the "no relevant sources" honest-empty-state) or for Phase 4's `/api/sources/:id/content` route to reuse the same ownership check pattern.
- **`SourcesPanel`'s local state already updates live via polling** — Phase 3/4 don't need to touch this panel; the `ChatPanel` (center) and `SourceViewerPanel` (right) placeholders in `app/notebooks/[id]/page.tsx`'s grid are exactly where those phases slot in next, same as noted at the end of Phase 1's context file.
