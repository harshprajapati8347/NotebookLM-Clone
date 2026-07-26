import type { RetrievedChunk } from "./retrieve";

/** A retrieved chunk enriched with its source's title — the [n] context unit
 * the LLM sees and the unit every citation number maps back to. */
export interface ContextChunk extends RetrievedChunk {
  sourceTitle: string;
}

export interface Citation {
  /** The [n] number this citation was rendered as in the answer. */
  index: number;
  sourceId: string;
  sourceTitle: string;
  sourceType: RetrievedChunk["sourceType"];
  locator: RetrievedChunk["locator"];
  snippet: string;
}
