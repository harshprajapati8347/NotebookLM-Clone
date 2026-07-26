import { v5 as uuidv5 } from "uuid";

// Fixed, arbitrary namespace UUID for this app (generated once, never changes) —
// makes point ids deterministic per (sourceId, chunkIndex), so re-indexing
// cleanly overwrites old vectors instead of duplicating them (plan §4.2).
const NAMESPACE = "8f14e45f-ceea-4b1c-9f2e-2b3a1a3e9d10";

export function deterministicPointId(sourceId: string, chunkIndex: number): string {
  return uuidv5(`${sourceId}:${chunkIndex}`, NAMESPACE);
}
