# NotebookLM Clone — Project Plan & Phase-Wise Implementation Guide (Core Scope)

**Scope note:** This version covers only the assignment's *required* features (no roadmap/podcast bonus). It's structured to be handed directly to Cursor IDE, phase by phase, in the minimum number of phases that still covers every rubric item.

---

## 1. Project Summary

Build a multi-notebook RAG research assistant. Users create isolated **notebooks**; each notebook holds multiple **sources** (PDF, plain text, website URL, YouTube video, VTT/transcript). Users ask questions scoped to a notebook and get **streamed, grounded answers with inline citations**, where every citation opens the original source at the exact spot it came from (PDF page, URL preview, YouTube timestamp, or highlighted text/transcript span).

Two pipelines, one vector store:
- **Ingestion pipeline** (async, per source): extract → chunk → embed → store → track status.
- **Query pipeline** (sync, per question): retrieve → generate (streamed) → validate citations → return.

---

## 2. Feature Specification (Required Only)

### 2.1 Notebook Management
- Create, rename, delete notebooks
- Dashboard listing all of a user's notebooks with source count + status summary
- Each notebook's data (sources, chunks, vectors, chat) is strictly isolated to that notebook and that user
- Empty states: no notebooks yet / notebook with no sources yet

### 2.2 Source Ingestion — 5 required types

| Source Type | Extraction | Locator (for citations) |
|---|---|---|
| PDF | Parse text per page | page number + char offset range |
| Plain Text | Paste or `.txt` upload | char offset range |
| Website URL | Fetch + readable-content extraction | paragraph index |
| YouTube Video | Fetch transcript + video metadata | timestamp (seconds) |
| VTT / Transcript file | Parse WebVTT/SRT cues | timestamp (seconds) |

Every source, regardless of type, goes through the same pipeline: **Upload/Register → Extract → Chunk → Embed → Store in vector DB → Ready**. Status is tracked and shown in the UI at every stage: `Uploading → Queued → Indexing (X%) → Ready` or `Failed` (with retry). Sources can be **removed** (cascades chunk + vector deletion) or **re-indexed** (re-runs extraction through storage, replacing old vectors).

### 2.3 Querying
- Natural-language chat per notebook
- Retrieval strictly scoped to that notebook's sources (hard isolation, not a UI-level filter)
- Streamed answer generation
- Every answer includes numbered inline citations `[1] [2]` tied to a **Sources Used** list
- If retrieval finds nothing relevant, the system says so plainly instead of guessing

### 2.4 Source Viewer (citation click-through)

| Source Type | Click-through behavior |
|---|---|
| PDF | Embedded viewer opens at the cited page, highlighted |
| Website URL | Readable preview opens scrolled to the cited paragraph |
| YouTube | Embedded player seeks to the cited timestamp |
| Plain Text | Text panel opens with the cited range highlighted |
| VTT/Transcript | Transcript panel opens, auto-scrolled and highlighted at the cited cue |

### 2.5 Explicitly Out of Scope (this phase)
- Learning roadmap generator (bonus — deferred)
- Podcast/audio overview generator (bonus — deferred)
- Notebook sharing, notes panel, flashcards, guide panel — not required by the assignment; skip to keep scope minimal. Can be layered on after core scope is graded/working.

---

## 3. Architecture

```
                 ┌───────────────────────────────────────────┐
                 │  Source Upload/Register (PDF / text / URL   │
                 │  / YouTube / VTT) inside a Notebook          │
                 └───────────────────┬───────────────────────┘
                                     │
                                     ▼
                 ┌───────────────────────────────────────────┐
                 │ POST /api/notebooks/:id/sources              │
                 │ -> saves file / registers URL,               │
                 │    creates Source row (status=QUEUED),       │
                 │    enqueues BullMQ job, returns 202           │
                 └───────────────────┬───────────────────────┘
                                     │ enqueue
                                     ▼
       ┌─────────────────────────────────────────────────────┐
       │              BullMQ Worker (Node)                     │
       │              Queue: source-ingestion                  │
       │                                                        │
       │  1. Dispatch to adapter by sourceType                 │
       │  2. Adapter extracts raw text + locator metadata       │
       │  3. Chunk (shared chunker, locator-aware)               │
       │  4. Generate embeddings (OpenAI text-embedding-3-small)│
       │  5. Upsert into Qdrant, namespaced by notebookId        │
       │  6. Write chunk metadata -> Postgres (Prisma)          │
       │  7. Update Source.status + progress                    │
       └───────────────────┬─────────────────────────────────┘
                           │
                           ▼
       ┌───────────────────────────────────┐
       │        Qdrant Vector Database       │
       │  Collection: notebook_chunks         │
       │  - dense vector (1536-d, cosine)     │
       │  - payload: notebookId, sourceId,    │
       │    sourceType, locator, text          │
       └───────────────────┬─────────────────
                           │
┌───────────────────────────┴────────────────────────────────────┐
│                QUERY PIPELINE (sync, per request)                 │
▼
User Question (scoped to notebookId)
   │
   ▼
[1] Embed question (dense)
   │
   ▼
[2] Vector Search (Qdrant, filtered by notebookId) — top-K=20
   │
   ▼
[3] Rerank (cross-encoder, e.g. Cohere Rerank) — keep top-k=6
   │
   ▼
[4] Build grounded prompt — numbered context chunks with source metadata
   │
   ▼
[5] LLM Generation (streamed) — answer + inline [n] citation markers
   │
   ▼
[6] Citation Validation — verify every [n] maps to an actually-retrieved chunk;
    drop/flag anything that doesn't
   │
   ▼
Answer (streamed) + Citations[] (sourceId, locator, snippet) → Frontend
```

**Why this shape:** ingestion is slow and heterogeneous (PDF parsing, YouTube transcript fetch, web scraping) so it's queued and async, with per-source status tracked independently. Query stays fast and simple — one embed call, one filtered vector search, one rerank call, one streamed generation call — while still guaranteeing grounding via the mandatory citation-validation step. This is intentionally leaner than a "hybrid search + multi-query + guardrails" pipeline: it covers every RAG-pipeline rubric point (chunking, embeddings, vector search, metadata handling, retrieval quality) without extra moving parts that don't map to a rubric line.

---

## 4. Data Model (Prisma)

```prisma
model User {
  id        String     @id // Clerk user id
  email     String     @unique
  name      String?
  imageUrl  String?
  notebooks Notebook[]
  createdAt DateTime   @default(now())
}

model Notebook {
  id           String        @id @default(cuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  title        String
  description  String?
  sources      Source[]
  chatSessions ChatSession[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([userId])
}

enum SourceType {
  PDF
  TEXT
  URL
  YOUTUBE
  VTT
}

enum SourceStatus {
  UPLOADING
  QUEUED
  INDEXING
  READY
  FAILED
}

model Source {
  id           String       @id @default(cuid())
  notebookId   String
  notebook     Notebook     @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  type         SourceType
  title        String
  originUrl    String?      // for URL/YouTube
  storagePath  String?      // for PDF/text file uploads
  status       SourceStatus @default(QUEUED)
  errorMessage String?
  progress     Int          @default(0)
  metadata     Json?        // e.g. { pageCount, videoDuration, channel }
  chunks       Chunk[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([notebookId])
}

model Chunk {
  id            String   @id @default(cuid())
  sourceId      String
  source        Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  notebookId    String   // denormalized for fast filtered scroll/debug
  chunkIndex    Int
  text          String
  locator       Json     // polymorphic, see §4.1
  tokenCount    Int
  vectorPointId String   @unique // Qdrant point id (deterministic)
  createdAt     DateTime @default(now())

  @@index([sourceId])
  @@index([notebookId])
}

model ChatSession {
  id         String        @id @default(cuid())
  notebookId String
  notebook   Notebook      @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  messages   ChatMessage[]
  createdAt  DateTime      @default(now())
}

model ChatMessage {
  id        String      @id @default(cuid())
  sessionId String
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role      String      // "user" | "assistant"
  content   String
  citations Json?       // Citation[]
  createdAt DateTime    @default(now())

  @@index([sessionId])
}

model IngestionJob {
  id        String   @id
  sourceId  String
  status    String   // waiting | active | completed | failed
  progress  Int      @default(0)
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 4.1 Locator Schema (polymorphic, per source type)

```ts
type Locator =
  | { kind: "pdf"; page: number; charStart: number; charEnd: number }
  | { kind: "text"; charStart: number; charEnd: number }
  | { kind: "url"; paragraphIndex: number }
  | { kind: "youtube"; startSec: number; endSec: number; videoId: string }
  | { kind: "vtt"; startSec: number; endSec: number; cueIndex: number };
```

### 4.2 Qdrant Collection Config

```jsonc
{
  "collection_name": "notebook_chunks",
  "vectors": { "size": 1536, "distance": "Cosine" },
  "payload_schema_indexes": ["notebookId", "sourceId", "sourceType"]
}
```

Every point payload carries `notebookId` (the mandatory filter on every query — this is the notebook-isolation boundary), `sourceId`, `sourceType`, `locator`, and `text`. Point IDs are deterministic (`uuid5(sourceId + chunkIndex)`), making re-indexing idempotent — re-running ingestion cleanly overwrites old vectors instead of duplicating them.

---

## 5. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Server components + route handlers = one codebase |
| UI | shadcn/ui + Tailwind | Fast, accessible components for chat/notebook UI |
| Theme | `next-themes` | Dark/light mode |
| Auth | **Clerk** (Google OAuth only — disable other providers in dashboard) | Drop-in auth, Next.js middleware, webhook to sync into Prisma |
| ORM / DB | **Prisma** + Postgres | Notebooks, sources, chunk metadata, chat history |
| Backend | Next.js Route Handlers | Co-located, typed API |
| Queue | BullMQ (+ Redis) | Async per-source ingestion with retry/progress tracking |
| Vector DB | Qdrant | Fast filtered vector search, notebook-scoped via payload filter |
| LLM | OpenAI GPT-5.5 | Grounded answer generation |
| Embeddings | `text-embedding-3-small` | Good quality/cost, 1536-d |
| Rerank | Cohere Rerank (or a local cross-encoder) | Single cheap call, meaningfully improves retrieval quality/precision |
| PDF parsing | `unpdf` / `pdf-parse` | Per-page text extraction |
| PDF viewer (frontend) | `react-pdf` | Page-jump + highlight in Source Viewer |
| Web scraping | Cheerio + `@mozilla/readability` | Clean article extraction from arbitrary URLs |
| YouTube transcript | `youtube-transcript` / `youtubei.js` + oEmbed | Transcript + video metadata, no API key needed |
| File storage | Local disk (dev) / S3-compatible bucket (prod) | Original PDFs/text for the source viewer |
| Streaming | Vercel AI SDK (`streamText`) | Token-streamed chat responses |

**Deliberately excluded to keep scope minimal:** hybrid (dense+sparse) search, multi-query expansion, LangGraph state machine, a full guardrails framework. These were used in the original subtitle-RAG reference project but aren't required to satisfy this assignment's rubric — dense retrieval + rerank + citation validation covers "retrieval quality," "minimal hallucinations," and "grounded answers" without the extra build time.

---

## 6. Ingestion Adapters

All adapters implement one interface so the rest of the pipeline (chunker → embedder → vector store) never needs to know which source type it's handling:

```ts
interface SourceAdapter {
  extract(source: Source): Promise<RawDocument>;
}
interface RawDocument {
  fullText: string;
  segments: { text: string; locator: Locator }[];
  metadata?: Record<string, unknown>;
}
```

- **PdfAdapter** — parse per-page text; each page becomes one or more locator-tagged segments.
- **TextAdapter** — pasted text or `.txt` upload; paragraph-split with running char offsets.
- **UrlAdapter** — fetch → Readability extraction → strip nav/boilerplate → paragraph-split segments.
- **YoutubeAdapter** — resolve `videoId` → fetch transcript cues → merge cues into ~30-60s segments → fetch title/channel/duration via oEmbed.
- **VttAdapter** — parse WebVTT/SRT cues → same cue-merge strategy as YouTube.

The shared **Chunker** takes `RawDocument.segments` and produces token-bounded chunks (~400-600 tokens, ~15% overlap), preserving the min/max locator range each chunk spans.

---

## 7. API Design

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/notebooks` | Create notebook |
| GET | `/api/notebooks` | List current user's notebooks |
| PATCH | `/api/notebooks/:id` | Rename / update description |
| DELETE | `/api/notebooks/:id` | Delete notebook (cascades everything) |
| POST | `/api/notebooks/:id/sources` | Register a source (file upload or URL/YouTube link) → `202 { sourceId }` |
| GET | `/api/notebooks/:id/sources` | List sources + status for a notebook |
| GET | `/api/sources/:id/status` | Poll ingestion status/progress |
| POST | `/api/sources/:id/reindex` | Re-run ingestion |
| DELETE | `/api/sources/:id` | Remove source (cascades chunks + vectors) |
| GET | `/api/sources/:id/content` | Fetch original content for the Source Viewer |
| POST | `/api/notebooks/:id/chat` | Run query pipeline → streamed answer + citations |
| GET | `/api/notebooks/:id/chat/:sessionId/history` | Fetch prior chat turns |
| POST | `/api/webhooks/clerk` | Sync Clerk user create/update/delete into Prisma `User` |

Every route (except the Clerk webhook) sits behind Clerk middleware. Every notebook/source-scoped route additionally checks `notebook.userId === auth().userId` before touching data — the second, independent layer of isolation on top of the Qdrant `notebookId` filter.

---

## 8. Frontend Design

### 8.1 Pages
- `/notebooks` — dashboard (grid of notebook cards, create button, status summary per card)
- `/notebooks/[id]` — workspace: two/three-pane layout
  - Left: **Sources panel** (list, add-source button, status chips)
  - Center: **Chat panel** (messages, streaming answer, citation markers)
  - Right: **Source Viewer panel** (opens on citation click, tabs per open source)

### 8.2 Key Components
- `NotebookCard`, `CreateNotebookDialog`, `RenameNotebookDialog`, `DeleteNotebookConfirm`
- `AddSourceDialog` (tabs: Upload PDF/Text, Paste Text, Website URL, YouTube URL, Upload VTT)
- `SourceListItem` — icon by type, status chip (`Uploading…`, `Indexing 42%`, `Ready`, `Failed — Retry`), remove/re-index menu
- `ChatMessageList`, `ChatInput`
- `CitationChip` — `[1]` inline, clickable, opens the Source Viewer at the right locator
- `PdfSourceViewer` (react-pdf, page-jump + highlight)
- `UrlSourceViewer` (readable preview, scrolled to paragraph)
- `YoutubeSourceViewer` (embedded iframe, seeked to timestamp)
- `TranscriptSourceViewer` (scrollable cue list, highlighted cue)
- `TextSourceViewer` (plain text panel, highlighted char range)
- `ThemeToggle`

### 8.3 UX Details
- Status polling every 2s while a source is `QUEUED`/`INDEXING`
- Streaming answer renders progressively; citation chips appear once citation validation completes (brief "verifying sources…" state)
- Distinct, friendly empty states: no notebooks / no sources / no chat yet / retrieval-found-nothing
- Distinct error states: upload failed, indexing failed (with retry), chat request failed
- Responsive: panels collapse to tabs under `md` breakpoint

---

## 9. Auth (Clerk, Google-only)

- Clerk configured with **only Google OAuth enabled** (disable email/password + other socials in the Clerk dashboard)
- `middleware.ts` uses `clerkMiddleware()` to protect `/notebooks/**` and `/api/**` (except the webhook)
- `user.created` webhook upserts into Prisma's `User` table on first sign-in, so the rest of the schema uses plain Postgres FKs
- `<UserButton />` in the header for account/sign-out

---

## 10. Non-Functional Requirements

| Concern | Approach |
|---|---|
| Latency target | < 4s p50 to first streamed token on `/api/notebooks/:id/chat` |
| Notebook isolation | Mandatory `notebookId` filter on every vector query + ownership check at API layer |
| Idempotent ingestion | Deterministic Qdrant point IDs (`uuid5(sourceId + chunkIndex)`) |
| Security | Validate uploaded file MIME/size; sanitize scraped HTML before rendering; secrets via env vars only |
| Error handling | Every adapter failure is caught, stored on `Source.errorMessage`, surfaced as `FAILED` status with a retry action — one bad source never blocks the rest of the notebook |
| Observability | Structured logs per pipeline stage (extraction, chunking, embedding, upsert, retrieval, generation, validation) |

---

## 11. Environment Variables

```
# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Database
DATABASE_URL=

# Vector DB
QDRANT_URL=
QDRANT_API_KEY=

# Queue
REDIS_URL=

# LLM / embeddings / rerank
OPENAI_API_KEY=
COHERE_API_KEY=

# Storage (prod)
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=

NEXT_PUBLIC_APP_URL=
```

---

## 12. Repository Structure

```
/app
  /notebooks
    page.tsx                        // dashboard
    /[id]/page.tsx                  // workspace
  /api
    /notebooks
      route.ts
      /[id]/route.ts
      /[id]/sources/route.ts
      /[id]/chat/route.ts
      /[id]/chat/[sessionId]/history/route.ts
    /sources
      /[id]/status/route.ts
      /[id]/reindex/route.ts
      /[id]/content/route.ts
      /[id]/route.ts                // DELETE
    /webhooks/clerk/route.ts
  layout.tsx
  middleware.ts

/lib
  /adapters
    pdfAdapter.ts
    textAdapter.ts
    urlAdapter.ts
    youtubeAdapter.ts
    vttAdapter.ts
    types.ts
  /ingestion
    chunker.ts
    embed.ts
  /retrieval
    retrieve.ts
    rerank.ts
    citationValidate.ts
  /queue
    connection.ts
    ingestionQueue.ts
    ingestionWorker.ts
  /qdrant
    client.ts
    collections.ts
  /db
    prisma.ts
  /auth
    clerk.ts

/prisma
  schema.prisma

/components
  /notebook/*
  /sources/*
  /chat/*
  /theme-toggle.tsx

/docs
  NotebookLM-Clone-Project-Plan.md   (this document)
```

---

## 13. Phase-Wise Implementation Plan (for Cursor IDE)

Six phases, each ending in a concrete, demoable milestone. Give each phase to Cursor as one scoped task; verify the milestone before moving to the next.

### **Phase 0 — Scaffold, Auth, DB, Vector Store**
- `create-next-app` (App Router, TS, Tailwind), install shadcn/ui, `next-themes`
- Set up Prisma + Postgres, apply the schema from §4, run first migration
- Set up Clerk (Google-only), `middleware.ts`, Clerk webhook → `User` upsert
- Set up Qdrant client + create the `notebook_chunks` collection
- Set up Redis + BullMQ connection (queue not used yet, just wired)
- ✅ **Milestone:** sign in with Google, land on an empty `/notebooks` page; `User` row exists in DB; Qdrant collection exists.

### **Phase 1 — Notebook Management**
- `/api/notebooks` routes: create, list, rename, delete
- Dashboard UI: `NotebookCard`, `CreateNotebookDialog`, `RenameNotebookDialog`, delete confirmation
- Workspace shell at `/notebooks/[id]` with the panel layout (empty panels for now)
- Empty states for zero notebooks / empty workspace
- ✅ **Milestone:** create, rename, and delete notebooks end-to-end through the UI; deleting a notebook cascades cleanly.

### **Phase 2 — Full Ingestion Pipeline (all 5 source types)**
- Build all 5 adapters (`PdfAdapter`, `TextAdapter`, `UrlAdapter`, `YoutubeAdapter`, `VttAdapter`) behind the shared `SourceAdapter` interface
- Build `chunker.ts` (locator-aware, token-bounded) and `embed.ts`
- Wire the BullMQ `ingestionQueue` + worker: extract → chunk → embed → upsert to Qdrant (namespaced by `notebookId`) → write `Chunk` rows → update `Source.status`/`progress`
- `POST /api/notebooks/:id/sources` (upload/register), `GET .../sources` (list + poll), `POST /api/sources/:id/reindex`, `DELETE /api/sources/:id`
- Frontend: `AddSourceDialog` (all 5 input types), `SourceListItem` with live status chip (2s polling), remove/re-index actions
- ✅ **Milestone:** upload/register one source of each of the 5 types into a notebook; watch each go `Queued → Indexing X% → Ready`; verify chunks exist in Postgres and vectors exist in Qdrant, correctly scoped by `notebookId`; delete and re-index both work.

### **Phase 3 — RAG Query Pipeline**
- `retrieve.ts` (embed question → Qdrant search filtered by `notebookId`, top-K=20)
- `rerank.ts` (Cohere Rerank call, top-k=6)
- Prompt construction: numbered context chunks with source metadata → grounded system prompt
- Streamed generation via Vercel AI SDK, with inline `[n]` citation markers
- `citationValidate.ts` — verify every `[n]` maps to an actually-retrieved chunk; strip/flag anything that doesn't
- `POST /api/notebooks/:id/chat` (streaming) + chat history persistence (`ChatSession`/`ChatMessage`)
- Frontend: `ChatMessageList`, `ChatInput`, streamed rendering, `CitationChip` (non-clickable placeholder for now), "no relevant sources found" empty case
- ✅ **Milestone:** ask a question in a notebook with indexed sources; get a streamed, grounded answer with validated numbered citations; ask an off-topic/no-context question and get an honest "not found in sources" response instead of a hallucinated one.

### **Phase 4 — Source Viewer (citation click-through)**
- `GET /api/sources/:id/content` — serve original PDF bytes / cached URL HTML / transcript JSON / raw text as appropriate
- `PdfSourceViewer` (react-pdf, jump to page + highlight)
- `UrlSourceViewer` (readable preview, scroll to paragraph)
- `YoutubeSourceViewer` (iframe seeked to timestamp)
- `TranscriptSourceViewer` (cue list, auto-scroll + highlight)
- `TextSourceViewer` (highlighted char range)
- Wire `CitationChip` clicks to open the correct viewer at the correct locator
- ✅ **Milestone:** for every one of the 5 source types, clicking its citation opens the Source Viewer at the exact cited spot.

### **Phase 5 — Polish, Evaluation, Deployment, Submission**
- Full pass on loading/empty/error states across every panel; responsive collapse under `md`
- Basic rate limiting on chat/upload routes; input validation on all routes
- Small retrieval sanity-check script (a handful of hand-written Q&A pairs per source type, confirm the right chunk/source is retrieved) — cheap way to demonstrate retrieval quality was considered
- Deploy (Vercel for the app; managed Postgres, Qdrant Cloud, managed Redis)
- Write README: setup instructions, architecture overview, retrieval flow diagram/explanation, env var list, how to run locally
- Record demo video: create notebook → ingest all 5 source types → show status indicators → ask questions → show streamed grounded answers with citations → click through citations for each source type → explain key technical decisions
- ✅ **Milestone:** public GitHub repo, live deployment link, complete README, demo video — all submission-ready.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Five source types = five failure modes | Each adapter isolated behind `SourceAdapter`; failures caught per-source, surfaced as `Source.status = FAILED` with `errorMessage` and a retry action — one bad source never blocks others |
| YouTube transcript fetch fails (no captions) | Detect explicitly, surface a clear "No captions available" failed state rather than a generic error |
| Web scraping quality varies across sites | Readability extraction with a raw text-strip fallback if it fails |
| Notebook isolation bugs | `notebookId` filter enforced at the retrieval-function level (never optional/client-controlled) + ownership check at the API layer — two independent barriers |
| LLM invents a citation/locator that doesn't exist | Citation validation is mandatory, not optional — no citation reaches the UI unless it matches an actually-retrieved chunk's stored locator |
| Cutting hybrid search/multi-query/guardrails hurts retrieval quality | Rerank step (Cohere) recovers most of the quality gap cheaply; the small retrieval sanity-check script in Phase 5 gives concrete evidence for the "retrieval quality considered" rubric point |

---

## 15. Evaluation Rubric Mapping

| Rubric Item | Covered by |
|---|---|
| Notebook Management (10) | §2.1, Phase 1 |
| Source Ingestion (20) | §2.2, §6, Phase 2 |
| RAG Pipeline (20) | §3, §7, Phase 3 |
| AI Responses (15) | Streaming + grounded prompt construction, Phase 3 |
| Citations and Source Attribution (15) | §2.4, §8.2, Phase 4 |
| Architecture and Code Quality (10) | §12 folder structure, adapter pattern §6 |
| UI and UX (10) | §8.3, Phase 5 |
| README/Docs (10) | Phase 5 |
| Demo Video (10) | Phase 5 |
| Overall Engineering Thoughtfulness (10) | §3 (lean but grounded pipeline), §14 |

---

## 16. Summary

This plan strips the architecture down to exactly what the assignment rubric requires: five ingestion adapters unified behind one interface, a polymorphic locator for precise citations, notebook isolation enforced at two independent layers, and a query pipeline (retrieve → rerank → generate → validate citations) that is simple enough to build in six phases but still directly addresses every graded RAG-quality concern (chunking, embeddings, vector search, metadata handling, retrieval quality, grounded/streamed answers, verifiable citations). Bonus features (roadmap, podcast) and non-required NotebookLM-parity extras (notes, guide panel, sharing) are deliberately deferred so the required scope ships cleanly first.
