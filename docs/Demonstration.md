# Demonstration — Script

A shot-by-shot script for a ~6–8 minute screen-recorded walkthrough of the app, covering every
rubric item from the project plan (§15). Record with a screen-capture tool (OBS, Loom,
QuickTime) at 1080p+; no editing required beyond trimming dead air between sections.

Suggested prep before recording: sign in once beforehand and have 3–4 candidate source files
ready (one PDF, a short `.vtt`/`.srt` file, a YouTube URL known to have captions, an article URL)
so there's no fumbling for files on camera. Consider running `npm run sanity-check` beforehand
and opening its seeded notebook as a fallback/backup if live ingestion of something is slow.

## 1. Intro (30s)

- One sentence: "This is a NotebookLM clone — a multi-notebook RAG assistant where every answer
  is grounded in your own sources with clickable citations."
- Briefly show the landing page (`/`) and the Google sign-in button.

## 2. Notebook management (45s)

- Sign in → land on `/notebooks` (show the empty state if this is a fresh account, otherwise the
  existing notebook grid).
- Create a new notebook ("Demo Notebook"), give it a description.
- Rename it, then open it — narrate: "each notebook's sources, chat, and vectors are completely
  isolated — both at the API layer and at the vector-search filter level."

## 3. Ingest all 5 source types (2 min)

For each, click **Add** in the Sources panel and narrate the source type + what locator it'll
produce for citations:

1. **PDF** — upload a PDF. "This gets parsed per page — each page becomes a citation-locator."
2. **Paste Text** — paste a paragraph or two. "Character-offset locators, so a citation can
   highlight the exact substring."
3. **Website URL** — paste an article URL. "Fetched and cleaned with Readability; each paragraph
   is its own locator."
4. **YouTube** — paste a URL for a video with captions. "Transcript fetched via captions;
   locators are timestamps."
5. **Transcript file** — upload a `.vtt`/`.srt`. "Same cue-based timestamp locators as YouTube."

- While these are still `Queued`/`Indexing X%`, point out the live status chips updating (2s
  polling) without a page refresh.
- Wait for all 5 to reach `Ready` (or cut here and resume once they are — this is the one part of
  the recording that benefits from a quick edit/cut for time).

## 4. Ask questions, show grounded streamed answers (2 min)

- Ask a question that should draw from 2–3 different sources at once (e.g. "Summarize what all
  these sources say about X" if they share a topic, or ask targeted questions one at a time).
- Narrate while the answer streams in: "Behind this: embed the question, filtered vector search
  scoped to this notebook, a Cohere rerank pass, then streamed generation with inline citation
  markers — and every `[n]` you see here has already been validated against the chunks that were
  actually retrieved, not just trusted from the model."
- Point at the numbered `[n]` chips inline and the "Sources used" list underneath.
- Ask an **off-topic** question (e.g. something unrelated to any ingested source) → show the
  honest "the sources don't cover this" response with zero citations, no hallucination.

## 5. Citation click-through, one per source type (1.5 min)

Ask (or reuse an earlier answer's citations covering) all 5 types, and click through each:

- **PDF** citation → viewer opens on the cited page, passage highlighted.
- **Text** citation → panel opens, cited character range highlighted.
- **URL** citation → readable preview, scrolled to and highlighting the cited paragraph, link to
  the original page.
- **YouTube** citation → embedded player, seeked to the cited timestamp.
- **Transcript** citation → cue list, auto-scrolled and highlighted at the cited cue.

- Show clicking a second citation while the viewer is already open (updates in place, no
  flicker), and the close (`×`) button returning to the empty state.

## 6. Responsive layout (20s)

- Shrink the browser window under the `md` breakpoint (or use devtools device toolbar) — show
  the 3-pane layout collapsing into the Sources / Chat / Viewer tab switcher, and that clicking a
  citation on mobile automatically switches to the Viewer tab.

## 7. Source management extras (20s)

- Re-index a source (status resets to `Queued` → `Ready` again).
- Remove a source, show it disappears from the list.

## 8. Wrap-up — key technical decisions (45s)

Narrate 3–4 of these (pick whichever feel most interesting to explain on camera):

- "Ingestion is async and per-source via BullMQ, so one bad source (e.g. a YouTube video with no
  captions) never blocks the rest of a notebook — it just shows `Failed` with a clear reason and
  a retry button."
- "Every source type funnels into the same adapter interface, chunker, and embedder — adding a
  6th source type would only mean writing one new adapter."
- "Notebook isolation is enforced twice, independently: an ownership check at the API layer, and
  a mandatory `notebookId` filter baked into the vector-search function signature — never
  optional, never client-controlled."
- "Citations aren't just formatted nicely — they're validated. If the model ever emits a `[7]`
  that doesn't correspond to a real retrieved chunk, it's stripped before the user sees it."
- "Storage swaps between local disk and S3 based on one env var, with zero code changes anywhere
  that calls it — this is what let the app move to a serverless deploy without touching the
  ingestion pipeline."

## Closing

- One line: repo link, live deployment link (if applicable), and a pointer to the README for
  setup/architecture details.
