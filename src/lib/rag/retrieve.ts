import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { embedQuery } from "@/lib/llm/voyage";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string[];
  pageStart: number | null;
  pageEnd: number | null;
  chunkIndex: number;
  content: string;
  contextPrefix: string | null;
  rrfScore: number;
}

export interface RetrieveOptions {
  collectionId?: string;
  limit?: number;
}

/** Per-arm candidate depth and RRF smoothing constant. */
const ARM_LIMIT = 30;
const RRF_K = 60;
const DEFAULT_LIMIT = 30;
const POOL_CAP = 60;

const rowSchema = z.object({
  chunk_id: z.string(),
  document_id: z.string(),
  document_title: z.string(),
  heading_path: z.array(z.string()),
  page_start: z.number().int().nullable(),
  page_end: z.number().int().nullable(),
  chunk_index: z.number().int(),
  content: z.string(),
  context_prefix: z.string().nullable(),
  rrf_score: z.number(),
});

/**
 * Hybrid retrieval for one sub-query: vector (cosine) + full-text
 * (websearch_to_tsquery) arms fused with Reciprocal Rank Fusion, in a single
 * SQL statement.
 */
export async function hybridSearch(
  subQuery: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const queryVector = JSON.stringify(await embedQuery(subQuery));
  const collectionFilter = opts.collectionId
    ? sql` and collection_id = ${opts.collectionId}`
    : sql``;

  const rows = await db.execute<Record<string, unknown>>(sql`
    with vec as (
      select id, row_number() over (order by embedding <=> ${queryVector}::vector) as rank
      from document_chunks
      where embedding is not null${collectionFilter}
      order by embedding <=> ${queryVector}::vector
      limit ${ARM_LIMIT}
    ),
    txt as (
      select id,
             row_number() over (
               order by ts_rank_cd(tsv, websearch_to_tsquery('english', ${subQuery})) desc
             ) as rank
      from document_chunks
      where tsv @@ websearch_to_tsquery('english', ${subQuery})${collectionFilter}
      order by ts_rank_cd(tsv, websearch_to_tsquery('english', ${subQuery})) desc
      limit ${ARM_LIMIT}
    )
    select
      c.id as chunk_id,
      c.document_id as document_id,
      d.title as document_title,
      c.heading_path as heading_path,
      c.page_start as page_start,
      c.page_end as page_end,
      c.chunk_index as chunk_index,
      c.content as content,
      c.context_prefix as context_prefix,
      (coalesce(1.0 / (${RRF_K} + vec.rank), 0) + coalesce(1.0 / (${RRF_K} + txt.rank), 0))::float8 as rrf_score
    from vec
    full outer join txt on vec.id = txt.id
    join document_chunks c on c.id = coalesce(vec.id, txt.id)
    join documents d on d.id = c.document_id
    order by rrf_score desc
    limit ${limit}
  `);

  return Array.from(rows).map((raw) => {
    const row = rowSchema.parse(raw);
    return {
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      headingPath: row.heading_path,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      chunkIndex: row.chunk_index,
      content: row.content,
      contextPrefix: row.context_prefix,
      rrfScore: row.rrf_score,
    };
  });
}

/**
 * Run all sub-queries in parallel, merge candidate pools, dedupe by chunk
 * (keeping the best RRF score), and cap the pool for reranking.
 */
export async function retrieveForQuestion(
  subQueries: string[],
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const pools = await Promise.all(subQueries.map((q) => hybridSearch(q, opts)));
  const byChunk = new Map<string, RetrievedChunk>();
  for (const chunk of pools.flat()) {
    const existing = byChunk.get(chunk.chunkId);
    if (!existing || chunk.rrfScore > existing.rrfScore) {
      byChunk.set(chunk.chunkId, chunk);
    }
  }
  return Array.from(byChunk.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, POOL_CAP);
}
