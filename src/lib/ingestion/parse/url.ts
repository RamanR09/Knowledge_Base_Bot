import Firecrawl, { type Document as FirecrawlDocument } from "@mendable/firecrawl-js";
import { requireEnv } from "@/lib/env";
import type { ParsedDocument } from "../types";
import { parseMarkdown } from "./markdown";

/** Lazy singleton — importing this module must never require the API key. */
let client: Firecrawl | undefined;

function firecrawl(): Firecrawl {
  if (!client) {
    client = new Firecrawl({ apiKey: requireEnv("FIRECRAWL_API_KEY") });
  }
  return client;
}

/** Scrape a single page as markdown and reuse the markdown parser. */
export async function scrapeUrl(url: string): Promise<ParsedDocument> {
  const page = await firecrawl().scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
  });
  return toParsedDocument(page, url);
}

/**
 * Crawl a site (sitemap-aware, same-origin) up to `limit` pages.
 * Returns one parsed document per successfully scraped page.
 */
export async function crawlSite(
  url: string,
  limit = 50,
): Promise<{ url: string; doc: ParsedDocument }[]> {
  const job = await firecrawl().crawl(url, {
    limit,
    sitemap: "include",
    allowExternalLinks: false,
    allowSubdomains: false,
    scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
  });
  if (job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Firecrawl crawl ${job.status} for ${url}`);
  }
  const results: { url: string; doc: ParsedDocument }[] = [];
  for (const page of job.data) {
    if (typeof page.markdown !== "string" || page.markdown.trim().length === 0) continue;
    const pageUrl = page.metadata?.url ?? url;
    results.push({ url: pageUrl, doc: toParsedDocument(page, pageUrl) });
  }
  return results;
}

function toParsedDocument(page: FirecrawlDocument, url: string): ParsedDocument {
  const markdown = page.markdown;
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    throw new Error(`Firecrawl returned no markdown content for ${url}`);
  }
  const doc = parseMarkdown(markdown, url);
  const metaTitle = page.metadata?.title?.trim();
  return metaTitle ? { ...doc, title: metaTitle } : doc;
}
