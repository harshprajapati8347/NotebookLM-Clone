import { fetchTranscript, YoutubeTranscriptError } from "youtube-transcript";
import type { Source } from "@prisma/client";
import { mergeCuesByDuration } from "./cueMerge";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

const SEGMENT_TARGET_SECONDS = 45;

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1) || null;
    }
    if (parsed.hostname.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] ?? null;
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

interface OEmbedInfo {
  title?: string;
  author_name?: string;
}

async function fetchOEmbed(url: string): Promise<OEmbedInfo> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!response.ok) return {};
    return (await response.json()) as OEmbedInfo;
  } catch {
    return {};
  }
}

/** Resolve videoId -> transcript cues -> merge into ~45s segments + oEmbed metadata (plan §6). */
export class YoutubeAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    if (!source.originUrl) {
      throw new AdapterError("YouTube source is missing originUrl");
    }

    const videoId = extractYoutubeVideoId(source.originUrl);
    if (!videoId) {
      throw new AdapterError("Could not parse a YouTube video id from the URL");
    }

    let cues;
    try {
      cues = await fetchTranscript(videoId);
    } catch (error) {
      if (error instanceof YoutubeTranscriptError) {
        throw new AdapterError(`No captions available for this video: ${error.message}`);
      }
      throw new AdapterError(
        `Failed to fetch YouTube transcript: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!cues || cues.length === 0) {
      throw new AdapterError("No captions available for this video");
    }

    // youtube-transcript reports offset/duration in milliseconds, not seconds.
    const groups = mergeCuesByDuration(
      cues.map((cue) => ({
        startSec: cue.offset / 1000,
        endSec: (cue.offset + cue.duration) / 1000,
        text: cue.text,
      })),
      SEGMENT_TARGET_SECONDS
    );

    const segments: RawSegment[] = groups.map((group) => ({
      text: group.text,
      locator: { kind: "youtube", startSec: group.startSec, endSec: group.endSec, videoId },
    }));

    const videoDuration = groups.at(-1)?.endSec ?? 0;
    const oembed = await fetchOEmbed(source.originUrl);
    const fullText = segments.map((s) => s.text).join("\n\n");

    return {
      fullText,
      segments,
      metadata: {
        videoId,
        title: oembed.title,
        channel: oembed.author_name,
        videoDuration: Math.round(videoDuration),
      },
    };
  }
}
