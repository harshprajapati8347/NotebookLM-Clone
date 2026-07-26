export interface Cue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface MergedCueGroup {
  text: string;
  startSec: number;
  endSec: number;
  /** index of the first raw cue folded into this group — used for VTT's cueIndex locator */
  firstCueIndex: number;
}

/** Merges timestamped cues (YouTube captions or VTT/SRT) into ~targetSeconds-long groups (plan §6). */
export function mergeCuesByDuration(cues: Cue[], targetSeconds: number): MergedCueGroup[] {
  if (cues.length === 0) return [];

  const groups: MergedCueGroup[] = [];
  let bucketText: string[] = [];
  let bucketStart = cues[0].startSec;
  let bucketEnd = cues[0].startSec;
  let bucketFirstIndex = 0;

  const flush = () => {
    if (bucketText.length === 0) return;
    groups.push({
      text: bucketText.join(" ").replace(/\s+/g, " ").trim(),
      startSec: bucketStart,
      endSec: bucketEnd,
      firstCueIndex: bucketFirstIndex,
    });
    bucketText = [];
  };

  cues.forEach((cue, index) => {
    if (bucketText.length > 0 && cue.endSec - bucketStart > targetSeconds) {
      flush();
      bucketStart = cue.startSec;
      bucketFirstIndex = index;
    }
    bucketText.push(cue.text);
    bucketEnd = cue.endSec;
  });
  flush();

  return groups;
}
