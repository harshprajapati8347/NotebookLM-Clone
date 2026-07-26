import { z } from "zod";

export const FILE_SOURCE_TYPES = ["PDF", "TEXT", "VTT"] as const;
export const LINK_SOURCE_TYPES = ["URL", "YOUTUBE"] as const;

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const registerLinkSourceSchema = z.object({
  type: z.enum(LINK_SOURCE_TYPES),
  originUrl: z.url("Must be a valid URL"),
  title: z.string().trim().max(200).optional(),
});

export const registerPastedTextSourceSchema = z.object({
  type: z.literal("TEXT"),
  pastedText: z.string().trim().min(1, "Pasted text cannot be empty").max(2_000_000),
  title: z.string().trim().max(200).optional(),
});

export const ACCEPTED_MIME_BY_TYPE: Record<(typeof FILE_SOURCE_TYPES)[number], string[]> = {
  PDF: ["application/pdf"],
  TEXT: ["text/plain"],
  VTT: ["text/vtt", "application/x-subrip", "text/plain", "application/octet-stream"],
};
