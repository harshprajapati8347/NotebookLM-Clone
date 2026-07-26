"use client";

/**
 * Embedded YouTube player, seeked to the cited timestamp (plan §2.4) via
 * the embed URL's `start` query param (seconds, integer) — no player SDK
 * needed for a one-shot seek-and-play.
 */
export function YoutubeSourceViewer({
  videoId,
  title,
  channel,
  startSec,
}: {
  videoId: string;
  title: string | null;
  channel: string | null;
  startSec: number;
}) {
  const embedUrl = `https://www.youtube.com/embed/${videoId}?start=${Math.max(0, Math.floor(startSec))}&autoplay=0`;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
        <iframe
          key={`${videoId}-${startSec}`}
          src={embedUrl}
          title={title ?? "YouTube video"}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div>
        {title && <p className="text-sm font-medium">{title}</p>}
        {channel && <p className="text-xs text-muted-foreground">{channel}</p>}
      </div>
    </div>
  );
}
