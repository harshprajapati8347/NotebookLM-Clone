import { getEncoding } from "js-tiktoken";
import type { Locator, RawSegment } from "@/lib/adapters/types";

// cl100k_base is the tokenizer used by GPT-4-family/embedding models; close
// enough for our token-budget purposes even for text-embedding-3-small.
const encoding = getEncoding("cl100k_base");

export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

const TARGET_TOKENS = 500;
const MAX_TOKENS = 600;
const OVERLAP_RATIO = 0.15;

export interface Chunk {
  text: string;
  locator: Locator;
  tokenCount: number;
}

/**
 * Merges the first and last segment's locators into one range for the whole
 * chunk. Only pdf/text/youtube/vtt have a genuine start/end range; `url`'s
 * paragraphIndex is a single discrete anchor, so a merged chunk just anchors
 * to its first paragraph.
 */
function mergeLocators(first: Locator, last: Locator): Locator {
  if (first.kind !== last.kind) return first;

  switch (first.kind) {
    case "pdf":
      return last.kind === "pdf" && last.page === first.page
        ? { kind: "pdf", page: first.page, charStart: first.charStart, charEnd: last.charEnd }
        : first;
    case "text":
      return last.kind === "text"
        ? { kind: "text", charStart: first.charStart, charEnd: last.charEnd }
        : first;
    case "url":
      return first;
    case "youtube":
      return last.kind === "youtube"
        ? { kind: "youtube", startSec: first.startSec, endSec: last.endSec, videoId: first.videoId }
        : first;
    case "vtt":
      return last.kind === "vtt"
        ? { kind: "vtt", startSec: first.startSec, endSec: last.endSec, cueIndex: first.cueIndex }
        : first;
  }
}

/**
 * If a single segment (e.g. a dense PDF page) alone exceeds MAX_TOKENS,
 * split it into word-count-proportional slices before bucketing. For
 * pdf/text, char offsets are recomputed per slice so citations stay precise;
 * for url/youtube/vtt (whose locator is a discrete anchor, not derived from
 * this segment's own char length) all slices keep the parent's locator —
 * an acceptable precision loss for the rare oversized-segment case.
 */
function splitOversizedSegment(segment: RawSegment): RawSegment[] {
  if (countTokens(segment.text) <= MAX_TOKENS) return [segment];

  const words = segment.text.split(/\s+/).filter(Boolean);
  const numSlices = Math.max(2, Math.ceil(countTokens(segment.text) / TARGET_TOKENS));
  const wordsPerSlice = Math.ceil(words.length / numSlices);

  const slices: RawSegment[] = [];
  let searchFrom = 0;

  for (let i = 0; i < words.length; i += wordsPerSlice) {
    const sliceText = words.slice(i, i + wordsPerSlice).join(" ");
    if (!sliceText) continue;

    if (segment.locator.kind === "pdf" || segment.locator.kind === "text") {
      const idx = segment.text.indexOf(sliceText, searchFrom);
      const relativeStart = idx === -1 ? searchFrom : idx;
      const relativeEnd = relativeStart + sliceText.length;
      searchFrom = relativeEnd;

      const base = segment.locator.charStart;
      slices.push({
        text: sliceText,
        locator:
          segment.locator.kind === "pdf"
            ? { kind: "pdf", page: segment.locator.page, charStart: base + relativeStart, charEnd: base + relativeEnd }
            : { kind: "text", charStart: base + relativeStart, charEnd: base + relativeEnd },
      });
    } else {
      slices.push({ text: sliceText, locator: segment.locator });
    }
  }

  return slices;
}

/**
 * Packs segments into token-bounded chunks (~500 target / 600 max tokens),
 * with ~15% segment-granularity overlap between consecutive chunks, and a
 * merged first->last-segment locator range per chunk (plan §6).
 */
export function chunkSegments(segments: RawSegment[]): Chunk[] {
  const expanded = segments.flatMap(splitOversizedSegment);
  if (expanded.length === 0) return [];

  const chunks: Chunk[] = [];
  let i = 0;

  while (i < expanded.length) {
    const bucket: RawSegment[] = [];
    let tokenSum = 0;
    let j = i;

    while (j < expanded.length) {
      const segTokens = countTokens(expanded[j].text);
      if (bucket.length > 0 && tokenSum + segTokens > MAX_TOKENS) break;
      bucket.push(expanded[j]);
      tokenSum += segTokens;
      j++;
      if (tokenSum >= TARGET_TOKENS) break;
    }

    const text = bucket.map((s) => s.text).join("\n\n");
    const locator = mergeLocators(bucket[0].locator, bucket[bucket.length - 1].locator);
    chunks.push({ text, locator, tokenCount: countTokens(text) });

    if (j >= expanded.length) break;

    const overlapCount = Math.max(1, Math.floor(bucket.length * OVERLAP_RATIO));
    i = Math.max(i + 1, j - overlapCount);
  }

  return chunks;
}
