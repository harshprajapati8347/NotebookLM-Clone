import type { Source } from "@prisma/client";
import { readSourceFile } from "@/lib/storage/local";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

/** Pasted text or a .txt upload; paragraph-split with running char offsets (plan §6). */
export class TextAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    let fullText: string;

    if (source.storagePath) {
      fullText = (await readSourceFile(source.storagePath)).toString("utf-8");
    } else {
      const metadata = source.metadata as { pastedText?: string } | null;
      if (!metadata?.pastedText) {
        throw new AdapterError("Text source has neither a storagePath nor pasted text");
      }
      fullText = metadata.pastedText;
    }

    if (!fullText.trim()) {
      throw new AdapterError("Text source is empty");
    }

    const segments: RawSegment[] = [];
    const paragraphs = fullText.split(/\n\s*\n/);
    let cursor = 0;

    for (const paragraph of paragraphs) {
      const start = fullText.indexOf(paragraph, cursor);
      const charStart = start === -1 ? cursor : start;
      const charEnd = charStart + paragraph.length;
      cursor = charEnd;

      if (!paragraph.trim()) continue;

      segments.push({
        text: paragraph.trim(),
        locator: { kind: "text", charStart, charEnd },
      });
    }

    if (segments.length === 0) {
      throw new AdapterError("No paragraphs found in text source");
    }

    return { fullText, segments };
  }
}
