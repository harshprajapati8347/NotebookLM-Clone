# NotebookLM Clone

A multi-notebook RAG research assistant. Create isolated **notebooks**, add sources of 5
different types (PDF, plain text, website URL, YouTube video, VTT/SRT transcript), and ask
questions scoped to a notebook — answers stream in with numbered, click-through citations that
open the original source at the exact page/paragraph/timestamp they came from.

Full spec: [`docs/NotebookLM-Clone-Project-Plan.md`](docs/NotebookLM-Clone-Project-Plan.md).
Per-phase build log: [`context/`](context/).
Demo video script: [`docs/Demonstration.md`](docs/Demonstration.md).

## Features

- **Notebook management** — create/rename/delete, isolated per user, per-notebook source/status
  summary.
- **5 source types**, all going through the same pipeline (extract → chunk → embed → store):
  PDF, pasted/`.txt` text, website URL, YouTube video, VTT/SRT transcript. Live status
  (`Queued → Indexing X% → Ready`/`Failed`), remove, and re-index.
- **Grounded, streamed chat** scoped strictly to one notebook's sources — retrieval is filtered
  by `notebookId` at the vector-search level (never a UI-only filter), with a reranking pass and
  mandatory citation validation so every `[n]` in an answer is guaranteed to map to a real,
  retrieved chunk.
- **Click-through citations** — every `[n]` and every "Sources used" row opens a per-type viewer
  (PDF page, readable-URL paragraph, YouTube timestamp, transcript cue, or text range) scrolled
  and highlighted at the exact cited spot.
- **Responsive** 3-pane workspace that collapses to a mobile tab switcher (Sources / Chat /
  Viewer) under the `md` breakpoint.
- **Rate limiting** (Redis-backed) on chat, source upload/registration, re-index, and content
  routes; Zod validation on every route's input; a basic SSRF guard on the URL adapter.

## Architecture

```
Source Upload/Register (PDF / text / URL / YouTube / VTT)
        │
        ▼
POST /api/notebooks/:id/sources ─── creates Source (QUEUED) ─── enqueues BullMQ job ─── 202
        │
        ▼
BullMQ Worker (separate long-running process, `npm run worker`)
  1. Dispatch to adapter by sourceType   (lib/adapters/*)
  2. Extract raw text + locator metadata
  3. Chunk (token-bounded, locator-aware)  (lib/ingestion/chunker.ts)
  4. Embed (OpenAI text-embedding-3-small) (lib/ingestion/embed.ts)
  5. Upsert into Qdrant, namespaced by notebookId
  6. Write Chunk rows -> Postgres (Prisma)
  7. Update Source.status/progress
        │
        ▼
Qdrant — collection "notebook_chunks", 1536-d cosine, payload: notebookId/sourceId/sourceType/locator/text
        │
┌───────┴───────────────────────────────────────────────────────┐
│                 QUERY PIPELINE (sync, per chat message)         │
│  [1] Embed question                                              │
│  [2] Qdrant search, filtered by notebookId, top-K=20             │
│  [3] Cohere Rerank -> top-k=6                                    │
│  [4] Build numbered grounded prompt from the 6 context chunks    │
│  [5] Stream generation (Vercel AI SDK) with inline [n] markers   │
│  [6] Validate every [n] against the actually-retrieved chunks —  │
│      anything that doesn't match is stripped, never shown        │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
Streamed answer + Citations[] (sourceId, locator, snippet) → frontend → click → Source Viewer
```

**Why two pipelines:** ingestion is slow and heterogeneous (5 very different extraction paths),
so it's queued and tracked per-source independently — one bad source never blocks the rest of a
notebook. Query stays fast and simple: one embed call, one filtered vector search, one rerank
call, one streamed generation call — while still guaranteeing grounding via the mandatory
citation-validation step.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router) + shadcn/ui + Tailwind, `next-themes` |
| Auth | Clerk (Google OAuth only) |
| ORM / DB | Prisma 6 + Postgres |
| Queue | BullMQ + Redis (ingestion) / Redis (rate limiting) |
| Vector DB | Qdrant |
| LLM | OpenAI (`gpt-5.5` by default) via Vercel AI SDK (`streamText`) |
| Embeddings | OpenAI `text-embedding-3-small` |
| Rerank | Cohere Rerank (`rerank-v3.5`), degrades gracefully to vector-score order if unset |
| PDF | `unpdf` (ingestion) / `react-pdf` (viewer) |
| Web scraping | Cheerio + `@mozilla/readability` |
| YouTube | `youtube-transcript` + oEmbed |
| File storage | Local disk (dev, default) or S3 (prod — set `S3_BUCKET` to switch) |

## Repository structure

```
/app            — Next.js App Router pages + API route handlers
/components     — notebook / sources / chat UI, shadcn primitives in components/ui
/lib
  /adapters     — one SourceAdapter implementation per source type + shared cue-merge/VTT parsing
  /ingestion    — chunker, embeddings, the ingestion pipeline orchestrator
  /retrieval    — retrieve, rerank, prompt building, citation validation, generation model
  /queue        — BullMQ queue + worker + shared Redis connection
  /qdrant       — client, collection setup, point upsert/delete helpers
  /storage      — local disk / S3 file storage, dispatched by env
  /db, /auth, /notebooks, /sources, /chat, /citations — Prisma client, auth helpers, per-domain
    queries/types/validation
/prisma         — schema.prisma + migrations
/scripts        — worker entry point, Qdrant setup, retrieval sanity-check
/docs           — project plan, demo video script
/context        — one file per implementation phase (what was built, decisions, how to verify)
```

## Local setup

**Prerequisites:** Node 20+, Docker (for local Postgres/Redis/Qdrant), a Clerk app (Google-only),
an OpenAI API key, a Cohere API key (optional — rerank degrades gracefully without it).

```bash
git clone <this-repo>
cd notebooklm
npm install

cp .env.example .env
# fill in NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY / OPENAI_API_KEY / COHERE_API_KEY
# (DATABASE_URL/QDRANT_URL/REDIS_URL already default to the docker-compose services below)

docker compose up -d          # Postgres, Redis, Qdrant
npx prisma migrate dev        # applies prisma/schema.prisma
npm run qdrant:setup          # creates the notebook_chunks collection

npm run dev                   # Next.js app — http://localhost:3000
npm run worker                # in a second terminal — ingestion worker (required for sources to index)
```

Sign in with Google, create a notebook, add a source of each type, ask a question.

### Optional: retrieval sanity check

```bash
npm run sanity-check              # seeds 5 known-content sources, runs 5 hand-written Q&A checks
npm run sanity-check -- --cleanup # same, then deletes the seeded notebook afterwards
```

Seeds one fixed-content source per type into its own dedicated notebook (idempotent — safe to
re-run), runs the real retrieve → rerank pipeline against 5 hand-written questions with known
correct answers, and prints a pass/fail table. See
[`scripts/retrieval-sanity-check.ts`](scripts/retrieval-sanity-check.ts).

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Summary:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Yes | Clerk app, Google-only sign-in enabled in the dashboard |
| `CLERK_WEBHOOK_SECRET` | Recommended | Syncs Clerk users into Postgres; the app also defensively upserts on page load if unset |
| `DATABASE_URL` | Yes | Postgres connection string |
| `QDRANT_URL`, `QDRANT_API_KEY` | Yes | Qdrant Cloud or self-hosted |
| `REDIS_URL` | Yes | Used by BullMQ (ingestion queue) and the rate limiter |
| `OPENAI_API_KEY` | Yes | Embeddings + chat generation |
| `OPENAI_CHAT_MODEL` | No | Overrides the default `gpt-5.5` |
| `COHERE_API_KEY` | Recommended | Rerank step; falls back to vector-score order if unset |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Only for serverless deploys | Leave empty to use local disk storage; required on Vercel (ephemeral filesystem) — see Deployment |
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL, used by a couple of absolute-link cases |

## Deployment

The Next.js app and the ingestion worker are deployed **separately** — Vercel's serverless
functions can't run BullMQ's long-lived worker process, so the worker needs a host that supports
one.

### 1. Managed services (provision first)

- **Postgres** — [Neon](https://neon.tech) or [Supabase](https://supabase.com) (free tier works).
- **Qdrant** — [Qdrant Cloud](https://cloud.qdrant.io) free cluster.
- **Redis** — [Upstash](https://upstash.com) (serverless-friendly, works fine for both BullMQ and
  the rate limiter).
- **S3-compatible storage** — an AWS S3 bucket (or R2/Backblaze). **Required** once the app runs
  on Vercel, since its functions have no persistent filesystem — set `S3_BUCKET` +
  `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` + `S3_REGION` and `lib/storage/index.ts`
  automatically switches from local disk to S3, no code changes needed.
  1. S3 → Create bucket (keep "Block all public access" on — files are only ever read through
     this app's own authenticated `/api/sources/:id/content` route, never served directly).
  2. IAM → Create a user scoped to just this bucket:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::your-bucket-name/*" },
         { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::your-bucket-name" }
       ]
     }
     ```
  3. Security credentials → Create access key ("Application running outside AWS").
- **Clerk** — switch the Clerk app to production mode, add the deployed domain, keep Google as
  the only enabled sign-in method, and register the production webhook URL
  (`https://<domain>/api/webhooks/clerk`) to get `CLERK_WEBHOOK_SECRET`.

### 2. Deploy the Next.js app (Vercel)

```bash
npm i -g vercel
vercel link
vercel env add ...   # add every variable from the table above (Production)
vercel --prod
```

`vercel.json` already raises `maxDuration` on the chat/upload/content routes (streamed
generation + rerank + LLM calls can run longer than the 10s default). `next.config.ts`'s
`outputFileTracingRoot` is already set correctly for Vercel's build tracing.

### 3. Deploy the worker (Railway / Render / Fly.io / any VM)

The worker is a plain Node process, containerized via `Dockerfile.worker`:

```bash
docker build -f Dockerfile.worker -t notebooklm-worker .
docker run --env-file .env notebooklm-worker
```

On Railway/Render: point a new service at this repo, set it to build with `Dockerfile.worker`,
and give it the exact same env vars as the Vercel deployment (it needs `DATABASE_URL`,
`REDIS_URL`, `QDRANT_URL`/`QDRANT_API_KEY`, `OPENAI_API_KEY`, and either the local-disk default
or the same `S3_*` vars — whichever storage backend the web app is using, the worker must use the
identical one, since it's the side that writes the files the app later reads).

### 4. Post-deploy checklist

- [ ] `npx prisma migrate deploy` ran against the production `DATABASE_URL`
- [ ] `npm run qdrant:setup` ran against the production `QDRANT_URL` (creates the collection once)
- [ ] Clerk webhook verified (create a user, confirm a `User` row appears in Postgres)
- [ ] One source of each type ingests successfully end-to-end (worker is actually running and
      reachable to the same Redis/Postgres/Qdrant as the web app)
- [ ] `npm run sanity-check` passes when pointed at the production env (optional but recommended)

## Rate limiting

`lib/rateLimit.ts` implements a Redis-backed fixed-window limiter (correct across multiple
serverless invocations, not just per-process). Budgets are per-user, tuned per route in
`RATE_LIMITS`:

| Route | Limit |
| --- | --- |
| `POST /api/notebooks/:id/chat` | 20 / min |
| `POST /api/notebooks/:id/sources` | 15 / min |
| `POST /api/sources/:id/reindex` | 10 / min |
| `GET /api/sources/:id/content` | 60 / min |
| `POST /api/notebooks`, `PATCH`/`DELETE /api/notebooks/:id` | 20–30 / min |

A Redis outage fails **open** (requests are allowed through, logged) rather than taking the whole
app down — consistent with the "one bad thing never blocks everything else" approach used
throughout ingestion.

## Known limitations

- PDF text highlighting in the viewer is a best-effort substring match (page navigation always
  works; the highlight itself can occasionally miss on unusual text-layout boundaries).
- URL paragraph alignment in the viewer can drift if the live page changes materially after
  ingestion (no cached copy of the originally-extracted HTML is persisted).
- No OCR fallback for scanned/image-only PDFs.
- `react-pdf` is pinned to `10.1.0` to avoid an upstream Webpack/`pdfjs-dist` 5.4.x interop bug in
  Next.js dev mode — see `context/Phase4_Source_Viewer.md` for details.

Full per-phase decisions, deviations, and known issues are recorded in [`context/`](context/).
