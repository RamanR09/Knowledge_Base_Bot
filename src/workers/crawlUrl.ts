import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, ingestionJobs } from "@/db/schema";
import type { CrawlUrlJobData } from "@/lib/ingestion/boss";
import { crawlSite, scrapeUrl } from "@/lib/ingestion/parse/url";
import type { ParsedDocument } from "@/lib/ingestion/types";
import { sha256 } from "@/lib/ingestion/validate";
import { processParsedDocument, recordFailure } from "./ingestDocument";

const CRAWL_PAGE_LIMIT = 50;

function normalizeUrl(url: string): string {
  return url.replace(/#.*$/, "").replace(/\/+$/, "");
}

async function markParsing(documentId: string): Promise<void> {
  await db
    .update(documents)
    .set({ status: "parsing", updatedAt: new Date() })
    .where(eq(documents.id, documentId));
  await db
    .update(ingestionJobs)
    .set({ stage: "parsing", progress: "0.1", startedAt: new Date(), error: null })
    .where(eq(ingestionJobs.documentId, documentId));
}

/**
 * `crawl-url` handler. Single-page mode scrapes one URL into the parent
 * document. Crawl mode discovers up to CRAWL_PAGE_LIMIT same-origin pages:
 * the parent document represents the root page; every other discovered page
 * gets its own document row (deduped by url hash within the collection) and
 * runs the same parse → chunk → contextualize → embed flow inline.
 */
export async function handleCrawlUrl(data: CrawlUrlJobData): Promise<void> {
  const { documentId, url, crawl } = data;
  try {
    const [parent] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (!parent) throw new Error(`Document ${documentId} not found`);

    await markParsing(documentId);

    if (!crawl) {
      const doc = await scrapeUrl(url);
      await db
        .update(documents)
        .set({ title: doc.title, updatedAt: new Date() })
        .where(eq(documents.id, documentId));
      await processParsedDocument(documentId, doc);
      return;
    }

    const pages = await crawlSite(url, CRAWL_PAGE_LIMIT);
    if (pages.length === 0) {
      throw new Error(`Crawl of ${url} discovered no scrapeable pages`);
    }

    // The parent document represents the root page: the exact URL when the
    // crawl returned it, otherwise the first discovered page.
    const rootUrl = normalizeUrl(url);
    const rootIndexMatch = pages.findIndex((p) => normalizeUrl(p.url) === rootUrl);
    const rootIndex = rootIndexMatch >= 0 ? rootIndexMatch : 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (i === rootIndex) {
        await db
          .update(documents)
          .set({ title: page.doc.title, updatedAt: new Date() })
          .where(eq(documents.id, documentId));
        await processParsedDocument(documentId, page.doc);
      } else {
        // Per-page failures must not sink the whole crawl.
        await ingestDiscoveredPage(parent, page.url, page.doc);
      }
    }
  } catch (err) {
    await recordFailure(documentId, err);
    throw err;
  }
}

type DocumentRow = typeof documents.$inferSelect;

async function ingestDiscoveredPage(
  parent: DocumentRow,
  pageUrl: string,
  doc: ParsedDocument,
): Promise<void> {
  let childId: string | undefined;
  try {
    const contentHash = sha256(Buffer.from(normalizeUrl(pageUrl), "utf8"));
    const [existing] = await db
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(
        and(
          eq(documents.collectionId, parent.collectionId),
          eq(documents.contentHash, contentHash),
        ),
      )
      .limit(1);

    if (existing && existing.status !== "failed") {
      return; // already ingested (or in flight) — dedupe by url hash
    }

    if (existing) {
      childId = existing.id; // failed earlier: reuse the row and retry inline
      await markParsing(childId);
    } else {
      const [child] = await db
        .insert(documents)
        .values({
          collectionId: parent.collectionId,
          sourceType: "url",
          title: doc.title,
          sourceUrl: pageUrl,
          contentHash,
          status: "parsing",
          createdBy: parent.createdBy,
        })
        .returning({ id: documents.id });
      childId = child.id;
      await db.insert(ingestionJobs).values({
        documentId: childId,
        stage: "parsing",
        progress: "0.1",
        startedAt: new Date(),
      });
    }

    await processParsedDocument(childId, doc);
  } catch (err) {
    if (childId) await recordFailure(childId, err);
    // Swallow: remaining pages should still be ingested.
  }
}
