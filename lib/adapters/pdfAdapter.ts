import { extractText, getDocumentProxy } from "unpdf";
import type { Source } from "@prisma/client";
import { readSourceFile } from "@/lib/storage";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

/** Per-page text extraction; each page becomes one locator-tagged segment (plan §6). */
export class PdfAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    if (!source.storagePath) {
      throw new AdapterError("PDF source is missing a storagePath");
    }

    const buffer = await readSourceFile(source.storagePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

    const segments: RawSegment[] = [];
    let fullText = "";

    for (let i = 0; i < pages.length; i++) {
      const pageText = (pages[i] ?? "").trim();
      if (!pageText) continue;

      segments.push({
        text: pageText,
        locator: {
          kind: "pdf",
          page: i + 1,
          charStart: 0,
          charEnd: pageText.length,
        },
      });

      fullText += (fullText ? "\n\n" : "") + pageText;
    }

    if (segments.length === 0) {
      throw new AdapterError("No extractable text found in PDF (may be scanned/image-only)");
    }

    return {
      fullText,
      segments,
      metadata: { pageCount: totalPages },
    };
  }
}
