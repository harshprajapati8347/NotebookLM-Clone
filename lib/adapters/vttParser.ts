export interface ParsedCue {
  startSec: number;
  endSec: number;
  text: string;
}

const TIMESTAMP_LINE = /(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/;

function timestampToSeconds(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return parts[0] ?? 0;
}

/** Parses WebVTT and SRT cue files into a flat list of {startSec, endSec, text} (plan §6). */
export function parseVttOrSrt(raw: string): ParsedCue[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/^WEBVTT.*\n/, "");
  const blocks = normalized.split(/\n\s*\n/);
  const cues: ParsedCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    const timestampLineIndex = lines.findIndex((l) => TIMESTAMP_LINE.test(l));
    if (timestampLineIndex === -1) continue;

    const match = lines[timestampLineIndex].match(
      /((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/
    );
    if (!match) continue;

    const startSec = timestampToSeconds(match[1]);
    const endSec = timestampToSeconds(match[2]);
    const text = lines
      .slice(timestampLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // strip inline VTT markup (<b>, <c>, timestamp tags, ...)
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      cues.push({ startSec, endSec, text });
    }
  }

  return cues;
}
