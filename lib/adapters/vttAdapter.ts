import type { Source } from "@prisma/client";
import { readSourceFile } from "@/lib/storage/local";
import { mergeCuesByDuration } from "./cueMerge";
import { parseVttOrSrt } from "./vttParser";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

const SEGMENT_TARGET_SECONDS = 45;

/** Parse WebVTT/SRT cues -> merge into ~45s segments, same cue-merge strategy as YouTube (plan §6). */
export class VttAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    if (!source.storagePath) {
      throw new AdapterError("VTT/transcript source is missing a storagePath");
    }

    const raw = (await readSourceFile(source.storagePath)).toString("utf-8");
    const cues = parseVttOrSrt(raw);

    if (cues.length === 0) {
      throw new AdapterError("Could not parse any cues from this VTT/SRT file");
    }

    const groups = mergeCuesByDuration(cues, SEGMENT_TARGET_SECONDS);

    const segments: RawSegment[] = groups.map((group, index) => ({
      text: group.text,
      locator: {
        kind: "vtt",
        startSec: group.startSec,
        endSec: group.endSec,
        cueIndex: group.firstCueIndex ?? index,
      },
    }));

    return {
      fullText: segments.map((s) => s.text).join("\n\n"),
      segments,
      metadata: { cueCount: cues.length, durationSec: groups.at(-1)?.endSec ?? 0 },
    };
  }
}
