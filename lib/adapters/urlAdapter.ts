import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import type { Source } from "@prisma/client";
import { AdapterError, type RawDocument, type RawSegment, type SourceAdapter } from "./types";

/** Fetch -> Readability extraction -> paragraph-split segments (plan §6). */
export class UrlAdapter implements SourceAdapter {
  async extract(source: Source): Promise<RawDocument> {
    if (!source.originUrl) {
      throw new AdapterError("URL source is missing originUrl");
    }

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
