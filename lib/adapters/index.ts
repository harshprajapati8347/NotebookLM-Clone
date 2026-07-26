import type { SourceType } from "@prisma/client";
import { PdfAdapter } from "./pdfAdapter";
import { TextAdapter } from "./textAdapter";
import { UrlAdapter } from "./urlAdapter";
import { YoutubeAdapter } from "./youtubeAdapter";
import { VttAdapter } from "./vttAdapter";
import type { SourceAdapter } from "./types";

const adapters: Record<SourceType, SourceAdapter> = {
  PDF: new PdfAdapter(),
  TEXT: new TextAdapter(),
  URL: new UrlAdapter(),
  YOUTUBE: new YoutubeAdapter(),
  VTT: new VttAdapter(),
};

export function getAdapterForType(type: SourceType): SourceAdapter {
  return adapters[type];
}

export * from "./types";
export { extractYoutubeVideoId } from "./youtubeAdapter";
