import type { ParsedCue } from "@/lib/adapters/vttParser";

/**
 * The JSON shapes `GET /api/sources/:id/content` returns for every source
 * type except PDF (which streams raw `application/pdf` bytes instead, so
 * `react-pdf` can load it directly from the same URL). Shared between the
 * route and every `*SourceViewer` component so the two never drift.
 */
export type SourceContentPayload =
  | { kind: "text"; fullText: string }
  | { kind: "url"; title: string | null; originUrl: string; paragraphs: string[] }
  | {
      kind: "youtube";
      videoId: string;
      title: string | null;
      channel: string | null;
      originUrl: string | null;
    }
  | { kind: "vtt"; cues: ParsedCue[] };
