# Phase 3 — RAG Query Pipeline

## What was built

- The full sync query pipeline from plan §3: embed question → Qdrant vector search filtered by `notebookId` (top-K=20) → Cohere Rerank (top-k=6) → numbered grounded prompt → streamed generation via the Vercel AI SDK (`streamText`) with inline `[n]` citation markers → mandatory citation validation (strip/flag anything that doesn't map to a retrieved chunk) → persisted `ChatMessage` with structured `Citation[]`.
- `POST /api/notebooks/:id/chat` — streams the pipeline's output as newline-delimited JSON (NDJSON) frames (`meta` → `delta`* → `final`/`error`), persists both the user's message and the final assistant message (content + citations) to Postgres.
- `GET /api/notebooks/:id/chat/:sessionId/history` — fetches a session's prior turns, per plan §7.
- One continuous chat thread per notebook: `/notebooks/[id]/page.tsx` server-fetches (or lazily creates) the notebook's `ChatSession` + its messages and passes them into `ChatPanel` as initial state — the same "server-fetch once, client-owned state" pattern Phase 1/2 used for the dashboard and sources panel.
- Frontend: `ChatPanel` (owns messages/session state, does the NDJSON `fetch` + manual stream-reading), `ChatMessageList` (auto-scrolling bubbles, "Thinking…"/"Verifying sources…" states), `ChatInput`, `CitationChip` (non-clickable `[n]` badge placeholder — Phase 4 wires the click), `SourcesUsedList` (the numbered "Sources Used" list under every assistant answer), `MessageContent` (splices validated `[n]` markers into `CitationChip`s inline).
- The empty-notebook / no-context case is a hard short-circuit: if vector search returns zero chunks (nothing indexed yet), the pipeline skips the LLM call entirely and returns a fixed honest message with no citations. The off-topic-with-existing-sources case (context exists but is irrelevant) is handled through prompt engineering — the system prompt explicitly instructs the model to say the sources don't cover it rather than guess — and was verified live to work correctly (see "How to verify" below).

## Files created/modified

- `lib/retrieval/retrieve.ts` — `retrieveChunks(notebookId, query, topK)`: embeds the question (reusing Phase 2's `embedText`) and runs `qdrant.search` with a `notebookId` payload filter that's baked into the function signature (never optional/client-controlled, per plan §10).
- `lib/retrieval/rerank.ts` — `rerankChunks(query, chunks, topK)`: plain `fetch` call to Cohere's `v2/rerank` (`rerank-v3.5`), with a graceful fallback to vector-score order if `COHERE_API_KEY` is unset or the call fails.
- `lib/retrieval/types.ts` — `ContextChunk` (a `RetrievedChunk` + `sourceTitle`) and `Citation` (`{index, sourceId, sourceTitle, sourceType, locator, snippet}`), the shared shapes threaded through prompt-building, citation validation, DB persistence, and the frontend.
- `lib/retrieval/prompt.ts` — `attachSourceTitles` (batched Prisma lookup for chunk → source title), `buildContextBlock` (numbered `[n] Source: "title" (locator label)\n<text>` blocks), `SYSTEM_PROMPT`, `buildUserPrompt`.
- `lib/retrieval/citationValidate.ts` — `validateCitations(rawText, contextChunks)`: regex-extracts every `[n]`, strips any whose `n` is out of range of the actually-retrieved context chunks, and returns both the cleaned text and a deduped, sorted `Citation[]`.
- `lib/retrieval/generate.ts` — `chatModel` (an `@ai-sdk/openai` model instance) + `CHAT_MODEL` (defaults to `"gpt-5.5"` per plan §5, overridable via `OPENAI_CHAT_MODEL`).
- `lib/citations/locatorLabel.ts` — `describeLocator(locator)`: human-readable label per locator kind (`"Page 3"`, `"Paragraph 2"`, `"at 1:23"`, `"Characters 0–1466"`). Shared now by the "Sources Used" list and citation chip tooltips; Phase 4's Source Viewer click-through will reuse it too.
- `lib/chat/types.ts` — `ChatMessageSummary`, `ChatSessionSummary`.
- `lib/chat/queries.ts` — `getOrCreateActiveChatSession`, `findOwnedChatSession` (ownership-checked through `notebook.userId`), `appendChatMessage`, `listMessagesForSession`.
- `app/api/notebooks/[id]/chat/route.ts` — the streaming `POST` route: auth + ownership check → Zod-validated body → resolve/create session → persist user message → run the retrieve/rerank/generate/validate pipeline inside a `ReadableStream` → emit NDJSON frames → persist the assistant message.
- `app/api/notebooks/[id]/chat/[sessionId]/history/route.ts` — the `GET` history route.
- `components/chat/chat-panel.tsx` — rewritten from Phase 1's disabled placeholder; owns `messages`/`sessionId` state, does the `fetch` + manual `ReadableStream` reader loop to parse NDJSON frames and update the streaming assistant bubble token-by-token.
- `components/chat/chat-message-list.tsx`, `chat-input.tsx`, `citation-chip.tsx`, `message-content.tsx`, `sources-used-list.tsx` — the Phase 3 chat UI.
- `app/notebooks/[id]/page.tsx` — now also calls `getOrCreateActiveChatSession(id)` and passes `notebookId`/`initialSessionId`/`initialMessages` into `ChatPanel`.
- `.env.example` — documented `OPENAI_CHAT_MODEL` as an optional override.
- `package.json` — added `ai` (^7.0.37) and `@ai-sdk/openai` (^4.0.20).

## Key decisions & deviations

- **NDJSON over the AI SDK's built-in `toDataStreamResponse()`/`toTextStreamResponse()` helpers.** The route manually wraps `streamText`'s `result.textStream` in a hand-rolled `ReadableStream` that emits line-delimited JSON frames (`{type:"meta"}` → `{type:"delta"}`* → `{type:"final", citations}` or `{type:"error"}`). This was necessary because citation validation can only run *after* the full answer has streamed (it needs the complete text to find every `[n]`), and the client needs those validated citations delivered over the same connection once they're ready, not via a second round-trip. A custom trailing frame on the same stream is simpler than juggling the AI SDK's data-stream protocol plus a side-channel for citations, and keeps the client-side parsing logic (a `while` loop splitting on `\n`) trivially easy to follow — consistent with this codebase's preference for small hand-rolled protocols over pulling in more framework surface (see Phase 2's hand-rolled VTT parser for the same philosophy).
- **One continuous `ChatSession` per notebook, not multiple.** Plan §2.3 reads as "chat per notebook" (singular), and nothing in the UI creates a second thread. `getOrCreateActiveChatSession` reuses the most-recently-created session or creates the first one. The schema still supports multiple sessions per notebook (unchanged), so this is a UI-layer decision, not a schema change — flagging per the workspace rule's "record every deviation" requirement.
- **Chat model defaults to `"gpt-5.5"`** per plan §5's explicit tech-stack line, but is overridable via `OPENAI_CHAT_MODEL` in case that model id isn't available on a given OpenAI account/region. Verified live against the real `OPENAI_API_KEY` in `.env` — see verification below — so this is confirmed working, not just plausible.
- **Rerank uses a plain `fetch` to Cohere's REST API instead of the `cohere-ai` SDK.** One call site, one endpoint — not worth a dependency. Falls back to vector-score ordering (not a hard failure) if the call errors, so a Cohere outage degrades retrieval quality rather than breaking chat entirely; this mirrors Phase 2's "one bad thing never blocks everything else" philosophy (plan §10/§14).
- **The "no relevant sources" short-circuit is a hard check on `retrieveChunks(...).length === 0`, not a vector-score threshold.** For an empty/all-`FAILED` notebook, Qdrant will genuinely return zero points for that `notebookId`, which is exactly the described milestone case ("ask an off-topic/no-context question... get an honest response"). For a notebook *with* sources but an off-topic question, retrieval still returns weak-scoring chunks (verified live: top score 0.078 vs. ~0.57 for an on-topic question), so instead of a brittle numeric cutoff, the system prompt explicitly instructs the model to say the sources don't cover it — verified live to produce "The provided sources don't cover recipes or chocolate chip cookies." with zero citations, not a hallucinated answer.
- **Citation numbering is 1:1 with the reranked context chunk order**, not deduplicated by source. If the model cites the same source twice via two different chunks, each gets its own `[n]` and its own "Sources Used" row (different locators can legitimately point at different spots in the same source). This matches the plan's "numbered inline citations `[1] [2]` tied to a Sources Used list" wording directly — the numbers *are* the Sources Used list entries.
- **`CitationChip` is intentionally non-interactive** (`cursor-default`, no `onClick`) per the Phase 3 milestone wording ("`CitationChip` (non-clickable placeholder for now)"); it shows the source title + locator label via a native `title` tooltip. Phase 4 wires it to open the Source Viewer.
- **Streaming persistence happens inside the request handler's `ReadableStream.start`, not in a `streamText({ onFinish })` callback.** Both would work; doing it inline after the `for await (const delta of result.textStream)` loop keeps the "stream tokens → validate citations → persist → emit final frame" sequence linear and easy to read in one function, rather than splitting state across a callback closure.

## Environment variables added/used

- **Newly exercised:** `COHERE_API_KEY` (rerank, `lib/retrieval/rerank.ts`) — was declared but unused since Phase 0.
- **Newly added (optional):** `OPENAI_CHAT_MODEL` — overrides the default `"gpt-5.5"` chat model id.
- Still using `OPENAI_API_KEY` (now for both embeddings and chat generation) and `QDRANT_URL`/`QDRANT_API_KEY` from earlier phases.

## How to verify the milestone

1. `docker compose up -d` (Postgres/Redis/Qdrant), `npm run dev` in one terminal (the worker isn't needed for this phase unless you're also testing ingestion).
2. Sign in, open a notebook that already has at least one `READY` source (Phase 2 left `Test Notebook 1` with 3 ready sources — 2 PDFs/text about computer networking + 1 YouTube video — in this environment's local Postgres).
3. Ask an on-topic question (e.g. "What is a computer network and what are its main types?") in the chat panel → answer streams in token-by-token, ends with inline `[n]` chips and a "Sources used" list underneath naming the right source(s) and locator (page/paragraph/timestamp).
4. Ask an off-topic question (e.g. "What's the best recipe for chocolate chip cookies?") → answer states plainly that the sources don't cover it, with zero citations — not a hallucinated recipe.
5. Ask a question in a notebook with **no** sources at all → immediately get the fixed "I couldn't find anything relevant..." message (no LLM call, no citations) — confirm no OpenAI/Cohere request appears in server logs for this case.
6. Confirm persistence in Postgres:
   ```sql
   select role, content, citations from "ChatMessage" where "sessionId" = (select id from "ChatSession" where "notebookId" = '<id>' order by "createdAt" desc limit 1) order by "createdAt";
   ```
   — both the user's question and the assistant's cleaned answer + `citations` JSON should be there.
7. Reload the page → the same conversation reappears (server-fetched via `getOrCreateActiveChatSession`), confirming history persistence works across page loads, not just within one streaming session.
8. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly (verified in this session).

I directly verified the **entire pipeline end-to-end** (steps 3-4's underlying logic, not just the shape) via a throwaway Node script (`tsx`, later deleted) that called `retrieveChunks` → `rerankChunks` → `attachSourceTitles`/`buildContextBlock` → `streamText` (real `gpt-5.5` call) → `validateCitations` directly against this environment's real `Test Notebook 1` (real OpenAI embeddings/generation, real Cohere rerank, real Qdrant Cloud search) — not mocked. Results:
   - On-topic question: retrieved 17 chunks, reranked to 6 (top Cohere relevance 0.749), got a correctly-cited multi-paragraph answer citing the PDF (pages 1 and 3) and the pasted-text source, and `validateCitations` correctly extracted 3 unique citations with accurate snippets/locators.
   - Off-topic question: retrieved chunks had near-zero rerank scores (0.04 vs 0.75), and the model correctly declined ("The provided sources don't cover recipes or chocolate chip cookies.") with zero citations extracted — exactly the milestone's required behavior.
   I also started the dev server and confirmed `POST /api/notebooks/:id/chat` compiles and correctly returns `401 Unauthorized` when unauthenticated (Clerk auth enforcement working), with no runtime errors in the server log. What I could **not** drive from here is the actual signed-in browser chat UI (streaming bubble rendering, citation chip tooltips, "Sources used" list rendering, empty/error states) — **please sign in and click through steps 2-7 above to confirm the milestone end-to-end in the browser.**

## Known issues / TODOs

- **`CitationChip` tooltips use the native `title` attribute**, not a styled tooltip component (none was installed in this codebase yet) — functional but not polished; fine to leave for Phase 5's UI pass, or upgrade if a `Tooltip` component gets added for other reasons.
- **No retry/regenerate button on a failed assistant message** — if generation throws, the user sees an inline error bubble but must retype their question rather than clicking "Retry". Not required by the plan; could be added in Phase 5's polish pass.
- **No rate limiting on the chat route yet** — plan §5/Phase 5 explicitly covers this later; chat is the most expensive endpoint in the app (embedding + rerank + LLM call per message) so this is worth prioritizing when Phase 5 lands.
- **`gpt-5.5` is used as-is per the plan** with no further validation beyond the live test above; if it becomes deprecated/renamed on OpenAI's side, set `OPENAI_CHAT_MODEL` rather than editing code.
- Carried over from Phase 0-2: `CLERK_WEBHOOK_SECRET` still unverified end-to-end; Google-only OAuth restriction still needs manual Clerk-dashboard confirmation; worker still runs via `tsx watch` (dev-only).

## What the next phase needs from this one

- **`Citation` (`lib/retrieval/types.ts`) is the exact shape Phase 4's Source Viewer click-through consumes** — `{sourceId, sourceType, locator, snippet}` is already everything needed to open the right viewer at the right spot; no transformation needed between the query pipeline and the viewer.
- **`describeLocator` (`lib/citations/locatorLabel.ts`) is already the shared human-readable-label function** — Phase 4 can reuse it directly for viewer headers/labels instead of writing a second locator-formatting function.
- **`CitationChip` (`components/chat/citation-chip.tsx`) is the exact non-clickable placeholder Phase 4 wires up** — add an `onClick` prop that opens `SourceViewerPanel` with `citation.sourceId` + `citation.locator`; everything else (rendering, tooltip content) stays as-is.
- **`ChatMessage.citations` is already persisted as real `Citation[]` JSON** — Phase 4 doesn't need to touch chat persistence; it only needs to read the citations already flowing through `ChatPanel`'s state and `MessageContent`'s rendering.
- **`SourceViewerPanel` (`components/sources/source-viewer-panel.tsx`) is still Phase 1's empty placeholder** — exactly where Phase 4 slots in next, same as noted at the end of Phase 1/2's context files.
