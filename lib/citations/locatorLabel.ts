import type { Locator } from "@/lib/adapters/types";

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Human-readable label for a locator, e.g. "Page 3", "at 1:23". Shared by
 * the query pipeline's "Sources Used" list (Phase 3) and the Source Viewer
 * click-through (Phase 4) so citation text and click-through target always
 * describe the same spot the same way.
 */
export function describeLocator(locator: Locator): string {
  switch (locator.kind) {
    case "pdf":
      return `Page ${locator.page}`;
    case "text":
      return `Characters ${locator.charStart}–${locator.charEnd}`;
    case "url":
      return `Paragraph ${locator.paragraphIndex + 1}`;
    case "youtube":
      return `at ${formatTimestamp(locator.startSec)}`;
    case "vtt":
      return `at ${formatTimestamp(locator.startSec)}`;
    default:
      return "";
  }
}
