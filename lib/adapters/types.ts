import type { Source } from "@prisma/client";

/** Polymorphic per-source-type citation locator — plan docs §4.1. */
export type Locator =
  | { kind: "pdf"; page: number; charStart: number; charEnd: number }
  | { kind: "text"; charStart: number; charEnd: number }
  | { kind: "url"; paragraphIndex: number }
  | { kind: "youtube"; startSec: number; endSec: number; videoId: string }
  | { kind: "vtt"; startSec: number; endSec: number; cueIndex: number };

export interface RawSegment {
  text: string;
  locator: Locator;
}

export interface RawDocument {
  fullText: string;
  segments: RawSegment[];
  metadata?: Record<string, unknown>;
}

/**
 * One interface for all five source types — the chunker/embedder/vector
 * store never need to know which adapter produced a RawDocument.
 */
export interface SourceAdapter {
  extract(source: Source): Promise<RawDocument>;
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}
