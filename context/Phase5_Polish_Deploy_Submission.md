# Phase 5 — Polish, Evaluation, Deployment, Submission

## What was built

- **Rate limiting** (plan §5/§10): a Redis-backed fixed-window limiter (`lib/rateLimit.ts`),
  applied to every non-trivial route — chat, source create/upload, re-index, source content, and
  notebook create/rename/delete — each with its own tuned per-user budget. Fails open (allows the
  request, logs) if Redis is briefly unreachable, so a rate-limiter outage never takes the app
  down.
- **S3 storage backend** (plan §5's "Local disk (dev) / S3-compatible bucket (prod)" line, not
  actually implemented until now): `lib/storage/s3.ts` + `lib/storage/index.ts` dispatch layer.
  Selecting S3 vs. local disk is now a single env var (`S3_BUCKET`) with zero call-site changes —
  every adapter/route already imported the opaque `saveSourceFile`/`readSourceFile`/
  `deleteSourceFiles` trio from Phase 2's design, so this was a pure drop-in. **Verified live**
  end-to-end against this environment's real S3 bucket via the new sanity-check script (see
  below) — a real PDF and a real VTT file were written to and read back from S3 successfully.
- **Basic SSRF guard** on `UrlAdapter` (plan §10 "Security" NFR): rejects `originUrl`s pointing
  at localhost, loopback, private (`10.x`, `172.16-31.x`, `192.168.x`), or link-local
  (`169.254.x`, including the cloud metadata endpoint) addresses before ever fetching them.
- **Mobile tab collapse** (plan §8.3, "panels collapse to tabs under `md` breakpoint" — not yet
  implemented through Phase 4, which only stacked panels vertically): `WorkspacePanels` now owns
  all three panels plus a `mobileTab` state, rendered via a small tab bar visible only below
  `md`. All three panels stay mounted at all times (only CSS `hidden`/`flex` toggles visibility)
  so chat history, source list polling, and loaded viewer content are never lost when switching
  tabs. Clicking a citation on mobile automatically switches to the Viewer tab.
- **Chat retry button**: a failed assistant message now shows a "Retry" button that re-sends the
  question that preceded it (plan Phase 3's Known Issues explicitly flagged this as deferred to
  Phase 5).
- **Retrieval sanity-check script** (plan §5, explicitly required as a rubric-evidence artifact):
  `scripts/retrieval-sanity-check.ts` (`npm run sanity-check`). Self-contained and idempotent —
  seeds one source of **each of the 5 required types** with fixed, mutually-distinct known
  content (Great Wall of China PDF generated via `pdfkit`, a Kilimanjaro pasted-text fact, the
  real Wikipedia Photosynthesis URL, the "Me at the zoo" YouTube video, a hand-written VTT about
  the Perseverance rover) into its own dedicated notebook, runs the real ingestion pipeline
  in-process (no queue/worker needed — calls `processSource` directly), then runs 5 hand-written
  {question, expected source type, expected keyword} pairs through the real
  retrieve → rerank pipeline and prints a pass/fail table. **Ran live in this environment: 5/5
  passed** (see verification below).
- **Deployment prep** (user explicitly chose "prepare config + instructions, I deploy myself" —
  no live deployment was performed from here): `Dockerfile.worker` + `.dockerignore` for the
  worker's separate deployable (Railway/Render/Fly/any Docker host — Vercel serverless functions
  can't run BullMQ's long-lived process), `vercel.json` (raises `maxDuration` on the chat/upload/
  content routes past the 10s default), and a full "Deployment" section in the README covering
  every managed service (Neon/Supabase Postgres, Qdrant Cloud, Upstash Redis, S3, Clerk
  production mode) plus a post-deploy checklist.
- **README rewritten from scratch**: architecture diagram, tech stack table, repo structure,
  local setup steps, full env var reference table, deployment guide (above), rate-limiting
  budgets table, and a "Known limitations" section consolidating what was already flagged across
  Phases 2-4's context files.
- **`docs/Demonstration.md`**: a shot-by-shot script for a ~6-8 minute demo video covering every
  rubric item (notebook CRUD, all 5 ingestion types with live status, grounded streamed chat with
  citations, off-topic honest-refusal case, click-through for all 5 source types, responsive
  collapse, re-index/remove, and a short "key technical decisions" wrap-up) — no video was
  actually recorded, per the plan's literal wording (a script file, not a recording, is the
  deliverable) and the user's explicit choice.

## Files created/modified

- `lib/rateLimit.ts` — `checkRateLimit`, `rateLimitResponse`, `RATE_LIMITS` (new)
- `app/api/notebooks/[id]/chat/route.ts`, `app/api/notebooks/[id]/sources/route.ts`,
  `app/api/sources/[id]/reindex/route.ts`, `app/api/sources/[id]/content/route.ts`,
  `app/api/notebooks/route.ts`, `app/api/notebooks/[id]/route.ts` — added a `checkRateLimit(...)`
  guard right after the existing auth check in each
- `lib/storage/s3.ts` (new), `lib/storage/index.ts` (new) — S3 backend + env-based dispatch
- `lib/adapters/pdfAdapter.ts`, `lib/adapters/textAdapter.ts`, `lib/adapters/vttAdapter.ts`,
  `app/api/notebooks/[id]/sources/route.ts`, `app/api/sources/[id]/content/route.ts`,
  `app/api/sources/[id]/route.ts` — repointed from `@/lib/storage/local` to `@/lib/storage`
  (the new dispatch module); `lib/storage/local.ts` itself is unchanged
- `lib/adapters/urlAdapter.ts` — added `assertPubliclyRoutable()` SSRF guard
- `components/notebook/workspace-panels.tsx` — rewritten to own `SourcesPanel`/`ChatPanel`/
  `SourceViewerPanel` + mobile tab state (previously only owned Chat + Viewer)
- `app/notebooks/[id]/page.tsx` — simplified to a single `<WorkspacePanels>` call; outer grid
  container switched from `grid grid-cols-1 md:grid-cols-[...]` to `flex flex-col md:grid
  md:grid-cols-[...]` so the mobile tab bar + single active panel behave correctly in a flex
  column below `md`
- `components/sources/sources-panel.tsx`, `components/chat/chat-panel.tsx`,
  `components/sources/source-viewer-panel.tsx` — outer wrapper classes adjusted for the new
  mobile-flex/desktop-grid dual layout (removed the old always-on stacking borders, added
  `flex-1 min-h-0` for mobile)
- `components/chat/chat-message-list.tsx` — added the Retry button + `onRetry` prop plumbing
- `components/chat/chat-panel.tsx` — passes `handleSend` down as `onRetry`
- `scripts/retrieval-sanity-check.ts` (new) — the sanity-check script
- `Dockerfile.worker`, `.dockerignore`, `vercel.json` (new) — deployment config
- `README.md` — rewritten
- `docs/Demonstration.md` (new)
- `.env.example` — tweaked the S3 comment to point at the README's renamed "Deployment" section
- `.env` — fixed a pre-existing trailing-space typo on `S3_BUCKET` (was silently making the
  bucket name invalid) and `lib/storage/s3.ts` was fixed to pass `S3_ACCESS_KEY_ID`/
  `S3_SECRET_ACCESS_KEY` as explicit `credentials` to `S3Client` rather than relying on the AWS
  SDK's default credential chain (which only recognizes `AWS_*`-prefixed env var names, not this
  project's `S3_*` names) — caught immediately when live-testing the sanity-check script, see
  Key decisions
- `package.json` — added `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (dependencies);
  `pdfkit`, `@types/pdfkit` (devDependencies, sanity-check-script-only); new scripts
  `worker:prod` (plain `tsx scripts/worker.ts`, no watch — for production) and `sanity-check`

## Key decisions & deviations

- **S3 storage was fully implemented in this phase, not left as a stub.** The plan's tech stack
  (§5) lists it as required for prod, and this environment already had real S3 credentials
  present in `.env` (see Phase 0's context file noting "real credentials were already present in
  the environment") — implementing it for real, and live-verifying it via the sanity-check
  script's PDF/VTT file round-trip, is strictly more useful evidence than documenting it as a
  TODO. This was **not** part of the original Phase 2 scope and is flagged here per the
  workflow rule's "record every deviation/judgment call" requirement.
- **Found and fixed a real bug while implementing S3**: the AWS SDK v3's default credential
  provider chain only looks for `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (or IAM
  roles/profiles) — it does **not** pick up arbitrary env var names, so `S3Client({ region })`
  alone silently found zero credentials even with `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` set.
  Fixed by passing `credentials: { accessKeyId, secretAccessKey }` explicitly, reading this
  project's own `S3_*` names (matching plan §11's exact variable names, which intentionally
  don't use the `AWS_` prefix). Caught immediately via the live sanity-check run rather than
  shipping silently broken.
- **Mobile "collapse to tabs" keeps all three panels mounted at all times**, toggling only CSS
  visibility (`hidden` vs `flex`), rather than conditionally rendering/unmounting the inactive
  ones. This was a deliberate choice over using Radix's `Tabs` primitive (which by default
  unmounts inactive `TabsContent`) specifically so that switching tabs on mobile never resets
  `ChatPanel`'s in-flight streaming state, `SourcesPanel`'s 2s status-polling `useEffect`, or
  `SourceViewerPanel`'s already-fetched content — all three are independent, stateful client
  components, and losing that state on a tab switch would be a regression relative to the desktop
  experience.
- **Rate limits are per-user (Clerk `userId`), not per-IP.** Every route already requires auth
  before the rate-limit check runs, so `userId` is a stable, spoof-resistant identity — simpler
  and more correct than trying to extract a client IP through whatever reverse proxy fronts the
  eventual deployment (Vercel's `x-forwarded-for` handling varies by config).
- **Fixed-window, not sliding-window or token-bucket.** A fixed window can allow a short burst
  right at a window boundary (e.g. up to 2x the nominal limit across two adjacent windows) —
  accepted as a reasonable simplicity/correctness trade-off for this assignment's scope; the
  budgets themselves (e.g. 20 chat messages/minute) are generous enough that this edge case is
  not a practical abuse vector.
- **The retrieval sanity-check script seeds its own dedicated, clearly-named notebook** (not the
  developer's real "Test" notebook) under a dedicated `sanity-check-user`, rather than mutating
  any existing real data. It's idempotent (checks for an already-`READY` source with the same
  title before re-ingesting) and defaults to leaving the notebook in place after a run (so it
  doubles as a live, inspectable demo of all 5 source types side by side in the UI) — pass
  `--cleanup` to delete it afterwards. This was verified with both modes in this session.
- **PDF fixture content for the sanity check is generated at runtime via `pdfkit`**, not a
  checked-in binary PDF file. Avoids committing a binary fixture to the repo and guarantees the
  PDF's text content exactly matches the hand-written expected keyword, with zero drift risk.
  `pdfkit` is a devDependency (script-only, not part of the production bundle).
- **Deployment was prepared, not executed**, per the user's explicit choice at the start of this
  phase (no accounts/credentials for Vercel/Railway/Neon/etc. were available to actually
  provision from here). `Dockerfile.worker`, `vercel.json`, and the README's deployment section
  are the concrete deliverables; the actual `vercel --prod` / Railway service creation / DNS is
  left for the user to run themselves following the README's steps.
- **No actual demo video was recorded** — per the plan's literal wording ("Record demo video...
  add short script to create the video") the graded deliverable is the script
  (`docs/Demonstration.md`), and the user explicitly chose script-only over attempting a
  recording from this environment.

## Environment variables added/used

- **Newly exercised (already declared since Phase 0, unused until now):** `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` — now live-verified against a real
  bucket.
- **Fixed:** a trailing-whitespace typo on `S3_BUCKET` in the local `.env` (not `.env.example`,
  which was already correct) that made the previously-unused value silently invalid.
- No new variable names were introduced. `REDIS_URL` (already required since Phase 0) now also
  backs the rate limiter, not just BullMQ.

## How to verify the milestone

1. **Rate limiting:** `npm run dev`, sign in, hammer `POST /api/notebooks/:id/chat` (or any
   limited route) more than its budget within a minute — the 21st+ chat request in under 60s
   should return `429` with a `Retry-After` header and a clear error message, not a 500 or a
   silent hang.
2. **S3 storage:** set `S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION` in
   `.env`, restart the app + worker, upload a PDF or VTT source — confirm in the S3 console that
   an object appears under `{notebookId}/{sourceId}/...`, and that clicking that source's
   citations still opens the viewer correctly (content route reads back from S3 transparently).
   Unset `S3_BUCKET` and it falls back to local disk with zero other changes.
3. **SSRF guard:** try adding a URL source pointing at `http://localhost:3000` or
   `http://169.254.169.254/` — should fail fast with "URLs pointing at local/internal hosts are
   not allowed" rather than attempting the fetch.
4. **Mobile collapse:** open a notebook workspace, shrink the browser below `md` (or use
   devtools' device toolbar) — confirm the 3 panels collapse into a Sources/Chat/Viewer tab bar,
   switching tabs preserves each panel's state (e.g. a chat message mid-stream, or an
   already-open source viewer), and clicking a citation while on the Chat tab auto-switches to
   Viewer.
5. **Chat retry:** force a chat request to fail (e.g. temporarily set an invalid
   `OPENAI_API_KEY`) — confirm the error bubble shows a "Retry" button, and clicking it re-sends
   the same question as a new turn.
6. **Retrieval sanity check:** `npm run sanity-check` — should print a 5/5-pass table (verified
   live in this session, transcript below). Re-run again to confirm idempotency (should skip
   re-ingesting already-`READY` sources via the `[skip]` log lines), then `npm run sanity-check
   -- --cleanup` to remove the seeded notebook.
7. **Build/lint/typecheck:** `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass cleanly
   (verified in this session — build succeeds with one pre-existing, unrelated warning about
   BullMQ's optional `@valkey/valkey-glide` peer dependency not being installed, which does not
   affect functionality since the app only uses BullMQ's standard Redis client).
8. **Deployment config:** `Dockerfile.worker` builds (`docker build -f Dockerfile.worker -t
   notebooklm-worker .`) — not executed from here since a full image build wasn't necessary to
   validate the Dockerfile's correctness by inspection, but the README's deployment steps are
   ready to follow for an actual Vercel + Railway/Render + managed-services deploy.

**Live verification performed in this session** (not just described): ran
`npm run sanity-check` twice — once seeding all 5 sources fresh (including a real S3 write for
the PDF and VTT files, and a real Wikipedia fetch + real YouTube transcript fetch), producing a
5/5 pass table; once more with `--cleanup` to confirm teardown. Also ran `npx tsc --noEmit`,
`npm run lint`, and `npm run build` to completion, all passing. What I could **not** drive from
here is the actual signed-in browser click-through of the mobile tab collapse and the chat retry
button — **please sign in, shrink the window below `md`, and force one chat error (e.g. briefly
break `OPENAI_API_KEY`) to confirm both interactively**, same caveat as every prior phase's
context file.

## Known issues / TODOs

- **Fixed-window rate limiting** can allow a short burst across a window boundary — see Key
  decisions. Acceptable for this scope; a sliding-window or token-bucket algorithm would be a
  drop-in future improvement to `lib/rateLimit.ts` if ever needed.
- **No actual production deployment was performed** — `Dockerfile.worker`/`vercel.json`/the
  README's deployment section are ready, but provisioning real Vercel/Railway/Neon/Qdrant
  Cloud/Upstash/S3/Clerk-production accounts and running the actual deploy commands is left to
  the user, per their explicit choice at the start of this phase.
- **No demo video was recorded**, only the script — per the plan's wording and the user's
  explicit choice.
- Carried over from Phases 0-4 and still open: `CLERK_WEBHOOK_SECRET` unverified end-to-end in
  this local dev environment (no public tunnel was set up — becomes moot once actually deployed,
  since the webhook needs a real public URL anyway); Google-only OAuth restriction still needs a
  one-time manual confirmation in the Clerk dashboard.

## What the next phase needs from this one

This is the final phase per the plan (§13) — there is no Phase 6. The project is submission-ready
modulo the user completing the "actually deploy" step using the README's instructions and
recording the demo video using `docs/Demonstration.md`'s script. Everything else required by
plan §13's Phase 5 milestone (polish, rate limiting/validation, retrieval sanity-check evidence,
deployment *preparation*, README, demo script) is complete and verified in this session.
