import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { Source } from "@prisma/client";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

// Basic SSRF guard (plan §10 "Security" NFR): a user-supplied URL is fetched
// server-side on every ingestion and every re-index/content-view, so it
// must never be able to reach internal/private network targets. This is a
// hostname/IP allow-list check, not a full DNS-rebinding-proof sandbox —
// sufficient for this assignment's scope without a dedicated egress proxy.
function assertPubliclyRoutable(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AdapterError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AdapterError("Only http/https URLs are supported");
  }

  const hostname = url.hostname.toLowerCase();
  const blockedHostnames = ["localhost", "0.0.0.0", "[::1]", "::1"];
  if (blockedHostnames.includes(hostname) || hostname.endsWith(".localhost")) {
    throw new AdapterError("URLs pointing at local/internal hosts are not allowed");
  }

  // IPv4 literal checks: loopback, private ranges, link-local (incl. cloud
  // metadata endpoint 169.254.169.254).
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0;
    if (isPrivate) {
      throw new AdapterError("URLs pointing at local/internal hosts are not allowed");
    }
  }
}

/** Fetch -> Readability extraction -> paragraph-split segments (plan §6). */
export class UrlAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    if (!source.originUrl) {
      throw new AdapterError("URL source is missing originUrl");
    }
    assertPubliclyRoutable(source.originUrl);

    let html: string;
    try {
      const response = await fetch(source.originUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NotebookLMCloneBot/1.0)" },
        redirect: "follow",
      });
      if (!response.ok) {
        throw new AdapterError(`Failed to fetch URL (HTTP ${response.status})`);
      }
      html = await response.text();
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(
        `Could not fetch URL: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    let title: string | undefined;
    let paragraphs: string[] = [];

    try {
      const dom = new JSDOM(html, { url: source.originUrl });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (article?.content) {
        title = article.title ?? undefined;
        const $ = cheerio.load(article.content);
        paragraphs = $("p, li, h1, h2, h3, blockquote")
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 0);
      }
    } catch {
      // fall through to the raw-strip fallback below (plan §14 risk mitigation)
    }

    if (paragraphs.length === 0) {
      const $ = cheerio.load(html);
      $("script, style, nav, header, footer, noscript").remove();
      title = title ?? $("title").text().trim();
      paragraphs = $("body")
        .find("p, li, h1, h2, h3")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter((text) => text.length > 20);
    }

    if (paragraphs.length === 0) {
      throw new AdapterError("Could not extract readable content from URL");
    }

    const segments: RawSegment[] = paragraphs.map((text, index) => ({
      text,
      locator: { kind: "url", paragraphIndex: index },
    }));

    return {
      fullText: paragraphs.join("\n\n"),
      segments,
      metadata: { pageTitle: title },
    };
  }
}
