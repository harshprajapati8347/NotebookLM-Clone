/**
 * Retrieval sanity-check script (plan §5/Phase 5): "a handful of
 * hand-written Q&A pairs per source type, confirm the right chunk/source is
 * retrieved — a cheap way to demonstrate retrieval quality was considered."
 *
 * This script is self-contained and idempotent:
 *   1. Ensures a dedicated sanity-check user + notebook exist.
 *   2. Seeds one source of EACH of the 5 required types with fixed, known,
 *      mutually-distinct content (so each hand-written question has exactly
 *      one right answer/source) — reusing the same adapters/pipeline the
 *      real app uses, not a mocked shortcut.
 *   3. Runs `processSource` in-process (no queue/worker needed) and waits
 *      for each source to reach READY.
 *   4. For each hand-written {question, expectedSourceType, expectedKeyword}
 *      pair, runs the real retrieve -> rerank pipeline and checks that the
 *      top-ranked chunk comes from the expected source type AND contains
 *      the expected keyword.
 *   5. Prints a pass/fail table and exits non-zero if anything failed.
 *
 * Usage: `npm run sanity-check` (add `-- --cleanup` to delete the notebook
 * afterwards; by default it's left in place so it can also be opened in the
 * UI as a live demo of all 5 source types side by side).
 */
import "dotenv/config";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/db/prisma";
import { saveSourceFile } from "@/lib/storage";
import { processSource } from "@/lib/ingestion/pipeline";
import { retrieveChunks } from "@/lib/retrieval/retrieve";
import { rerankChunks } from "@/lib/retrieval/rerank";
import type { Prisma, SourceType } from "@prisma/client";

const SANITY_USER_ID = "sanity-check-user";
const SANITY_USER_EMAIL = "sanity-check@example.com";
const NOTEBOOK_TITLE = "Retrieval Sanity Check (auto-generated)";

const RETRIEVE_TOP_K = 20;
const RERANK_TOP_K = 6;

interface TestCase {
  sourceType: SourceType;
  question: string;
  expectedKeyword: string;
}

const TEST_CASES: TestCase[] = [
  {
    sourceType: "PDF",
    question: "How long is the Great Wall of China?",
    expectedKeyword: "13,000",
  },
  {
    sourceType: "TEXT",
    question: "What is the tallest mountain in Africa and how tall is it?",
    expectedKeyword: "kilimanjaro",
  },
  {
    sourceType: "URL",
    question: "What pigment do plants use to absorb light during photosynthesis?",
    expectedKeyword: "chlorophyll",
  },
  {
    sourceType: "YOUTUBE",
    question: "What is notable about the elephants seen in the video?",
    expectedKeyword: "trunk",
  },
  {
    sourceType: "VTT",
    question: "Where did the Perseverance rover land on Mars?",
    expectedKeyword: "jezero",
  },
];

const PDF_TEXT =
  "The Great Wall of China is a series of fortifications built across the historical northern " +
  "borders of ancient Chinese states. The best-known sections, built by the Ming dynasty, stretch " +
  "for over 13,000 miles (21,000 kilometers) and were constructed over several centuries to protect " +
  "against invasions from nomadic groups.";

const TEXT_PASTED =
  "Mount Kilimanjaro, located in Tanzania, is the tallest mountain in Africa. It rises 5,895 meters " +
  "(19,341 feet) above sea level and is the tallest freestanding mountain in the world, meaning it is " +
  "not part of a mountain range.";

const URL_ARTICLE = "https://en.wikipedia.org/wiki/Photosynthesis";

// "Me at the zoo" — the first video ever uploaded to YouTube. Chosen (same
// as Phase 2's live verification) because it's short, guaranteed to have
// captions, and unlikely to ever be taken down.
const YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const VTT_CONTENT = `WEBVTT

00:00:00.000 --> 00:00:08.000
NASA's Perseverance rover landed on Mars in February 2021.

00:00:08.000 --> 00:00:16.000
It touched down in Jezero Crater, the site of an ancient river delta.

00:00:16.000 --> 00:00:24.000
Scientists believe Jezero Crater may hold signs of ancient microbial life.
`;

async function buildPdfBuffer(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.text(text);
    doc.end();
  });
}

async function ensureSanityUserAndNotebook(): Promise<string> {
  await prisma.user.upsert({
    where: { id: SANITY_USER_ID },
    update: {},
    create: { id: SANITY_USER_ID, email: SANITY_USER_EMAIL },
  });

  const existing = await prisma.notebook.findFirst({
    where: { userId: SANITY_USER_ID, title: NOTEBOOK_TITLE },
  });
  if (existing) return existing.id;

  const notebook = await prisma.notebook.create({
    data: {
      userId: SANITY_USER_ID,
      title: NOTEBOOK_TITLE,
      description: "Seeded by scripts/retrieval-sanity-check.ts — safe to delete.",
    },
  });
  return notebook.id;
}

async function ensureSource(
  notebookId: string,
  type: SourceType,
  title: string,
  seed: (
    sourceId: string
  ) => Promise<Partial<{ storagePath: string; originUrl: string; metadata: Prisma.InputJsonValue }>>
): Promise<string> {
  const existing = await prisma.source.findFirst({ where: { notebookId, type, title } });
  if (existing && existing.status === "READY") {
    console.log(`  [skip] ${type} "${title}" already READY`);
    return existing.id;
  }

  const source =
    existing ??
    (await prisma.source.create({ data: { notebookId, type, title, status: "QUEUED" } }));

  const extra = await seed(source.id);
  if (Object.keys(extra).length > 0) {
    await prisma.source.update({ where: { id: source.id }, data: extra });
  }

  console.log(`  [ingest] ${type} "${title}"...`);
  await processSource(source.id);
  return source.id;
}

async function seedSources(notebookId: string): Promise<void> {
  console.log("Seeding 5 known-content sources (idempotent)...");

  await ensureSource(notebookId, "PDF", "Great Wall of China (sanity fixture).pdf", async (sourceId) => {
    const buffer = await buildPdfBuffer(PDF_TEXT);
    const storagePath = await saveSourceFile(notebookId, sourceId, "great-wall.pdf", buffer);
    return { storagePath };
  });

  await ensureSource(notebookId, "TEXT", "Mount Kilimanjaro (sanity fixture)", async () => {
    return { metadata: { pastedText: TEXT_PASTED } };
  });

  await ensureSource(notebookId, "URL", "Photosynthesis — Wikipedia (sanity fixture)", async () => {
    return { originUrl: URL_ARTICLE };
  });

  await ensureSource(notebookId, "YOUTUBE", "Me at the zoo (sanity fixture)", async () => {
    return { originUrl: YOUTUBE_URL };
  });

  await ensureSource(notebookId, "VTT", "Perseverance rover landing (sanity fixture)", async (sourceId) => {
    const buffer = Buffer.from(VTT_CONTENT, "utf-8");
    const storagePath = await saveSourceFile(notebookId, sourceId, "perseverance.vtt", buffer);
    return { storagePath };
  });
}

async function runTestCases(notebookId: string): Promise<boolean> {
  console.log("\nRunning retrieval sanity checks...\n");

  const rows: {
    question: string;
    expectedType: SourceType;
    pass: boolean;
    actualType?: SourceType;
    actualScore?: number;
    keywordFound: boolean;
  }[] = [];

  for (const testCase of TEST_CASES) {
    const retrieved = await retrieveChunks(notebookId, testCase.question, RETRIEVE_TOP_K);
    const reranked = await rerankChunks(testCase.question, retrieved, RERANK_TOP_K);
    const top = reranked[0];

    const actualType = top?.sourceType;
    const keywordFound = top?.text.toLowerCase().includes(testCase.expectedKeyword.toLowerCase()) ?? false;
    const pass = actualType === testCase.sourceType && keywordFound;

    rows.push({
      question: testCase.question,
      expectedType: testCase.sourceType,
      pass,
      actualType,
      actualScore: top?.score,
      keywordFound,
    });
  }

  const width = Math.max(...rows.map((r) => r.question.length), 40);
  console.log(
    `${"QUESTION".padEnd(width)}  EXPECTED   GOT        KEYWORD  RESULT`
  );
  console.log("-".repeat(width + 40));
  for (const row of rows) {
    console.log(
      `${row.question.padEnd(width)}  ${row.expectedType.padEnd(9)}  ${(row.actualType ?? "—").padEnd(9)}  ${(row.keywordFound ? "yes" : "no").padEnd(7)}  ${row.pass ? "✅ PASS" : "❌ FAIL"}`
    );
  }

  const passCount = rows.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${rows.length} checks passed.`);
  return passCount === rows.length;
}

async function main() {
  const cleanup = process.argv.includes("--cleanup");

  const notebookId = await ensureSanityUserAndNotebook();
  console.log(`Using sanity-check notebook: ${notebookId}\n`);

  await seedSources(notebookId);

  const failedSources = await prisma.source.findMany({
    where: { notebookId, status: "FAILED" },
    select: { type: true, title: true, errorMessage: true },
  });
  if (failedSources.length > 0) {
    console.error("\nSome sources failed to ingest:");
    for (const s of failedSources) {
      console.error(`  - ${s.type} "${s.title}": ${s.errorMessage}`);
    }
  }

  const allPassed = await runTestCases(notebookId);

  if (cleanup) {
    await prisma.notebook.delete({ where: { id: notebookId } });
    console.log("\nCleaned up sanity-check notebook.");
  } else {
    console.log(
      `\nLeaving notebook ${notebookId} in place — open it in the UI to inspect, or re-run with --cleanup to delete it.`
    );
  }

  process.exit(allPassed && failedSources.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Retrieval sanity check crashed:", error);
  process.exit(1);
});
