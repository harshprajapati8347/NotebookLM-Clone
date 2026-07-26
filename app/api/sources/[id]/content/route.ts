import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/clerk";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rateLimit";
import { extractYoutubeVideoId } from "@/lib/adapters";
import { UrlAdapter } from "@/lib/adapters/urlAdapter";
import { parseVttOrSrt } from "@/lib/adapters/vttParser";
import { readSourceFile } from "@/lib/storage";
import { findOwnedSource } from "@/lib/sources/queries";
import type { SourceContentPayload } from "@/lib/sources/content";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Serves original source content for the Source Viewer's citation
 * click-through (plan §2.4/Phase 4). PDF is returned as raw bytes so
 * `react-pdf` can load it directly; every other type returns a
 * `SourceContentPayload` JSON body.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(
    "sourceContent",
    userId,
    RATE_LIMITS.sourceContent.limit,
    RATE_LIMITS.sourceContent.windowSeconds
  );
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit);
  }

  const { id } = await params;
  const source = await findOwnedSource(id, userId);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {
    if (source.type === "PDF") {
      if (!source.storagePath) {
        return NextResponse.json({ error: "PDF file is missing" }, { status: 404 });
      }
      const buffer = await readSourceFile(source.storagePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const payload = await buildJsonPayload(source);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load source content";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function buildJsonPayload(
  source: Awaited<ReturnType<typeof findOwnedSource>>
): Promise<SourceContentPayload> {
  if (!source) throw new Error("Source not found");

  switch (source.type) {
    case "TEXT": {
      let fullText: string;
      if (source.storagePath) {
        fullText = (await readSourceFile(source.storagePath)).toString("utf-8");
      } else {
        const metadata = source.metadata as { pastedText?: string } | null;
        fullText = metadata?.pastedText ?? "";
      }
      return { kind: "text", fullText };
    }

    case "URL": {
      if (!source.originUrl) {
        throw new Error("URL source is missing its origin URL");
      }
      // Re-run the same Readability extraction used at ingestion time so
      // paragraph indices line up with each chunk's stored `paragraphIndex`
      // locator. Known limitation: if the page's content has changed since
      // ingestion, indices may drift — acceptable for this scope (no cached
      // copy of the extracted HTML is persisted).
      const raw = await new UrlAdapter().extract(source);
      const meta = raw.metadata as { pageTitle?: string } | undefined;
      return {
        kind: "url",
        title: meta?.pageTitle ?? source.title,
        originUrl: source.originUrl,
        paragraphs: raw.segments.map((segment) => segment.text),
      };
    }

    case "YOUTUBE": {
      const metadata = source.metadata as
        | { videoId?: string; title?: string; channel?: string }
        | null;
      const videoId =
        metadata?.videoId ?? (source.originUrl ? extractYoutubeVideoId(source.originUrl) : null);
      if (!videoId) {
        throw new Error("Could not resolve the YouTube video id");
      }
      return {
        kind: "youtube",
        videoId,
        title: metadata?.title ?? source.title,
        channel: metadata?.channel ?? null,
        originUrl: source.originUrl,
      };
    }

    case "VTT": {
      if (!source.storagePath) {
        throw new Error("Transcript file is missing");
      }
      const raw = (await readSourceFile(source.storagePath)).toString("utf-8");
      return { kind: "vtt", cues: parseVttOrSrt(raw) };
    }

    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}
