import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** tsvector custom type (drizzle has no built-in). */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ------------------------------------------------------------------ */
/* Better Auth tables (shape required by better-auth drizzle adapter)  */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("member"), // 'member' | 'admin'
  ...timestamps,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    /** Better Auth 1.7+: identity namespace (e.g. "local:credential"). */
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [uniqueIndex("account_issuer_account_uq").on(t.issuer, t.accountId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/* ------------------------------------------------------------------ */
/* Knowledge base                                                      */
/* ------------------------------------------------------------------ */

export const sourceTypeEnum = pgEnum("source_type", ["upload", "url"]);
export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "ready",
  "failed",
]);

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  /** { contextualRetrieval: boolean } */
  settings: jsonb("settings").notNull().default({ contextualRetrieval: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  ...timestamps,
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    sourceType: sourceTypeEnum("source_type").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    filePath: text("file_path"),
    mimeType: text("mime_type"),
    contentHash: text("content_hash").notNull(),
    status: documentStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    pageCount: integer("page_count"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("documents_collection_hash_uq").on(t.collectionId, t.contentHash),
    index("documents_collection_idx").on(t.collectionId),
    index("documents_status_idx").on(t.status),
  ],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** Denormalized for collection-filtered search without a join. */
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    /** Contextual-retrieval situating prefix (indexed, never cited/shown). */
    contextPrefix: text("context_prefix"),
    headingPath: text("heading_path").array().notNull().default([]),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    tokenCount: integer("token_count").notNull(),
    suspectedInjection: boolean("suspected_injection").notNull().default(false),
    embedding: vector("embedding", { dimensions: 1024 }),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(context_prefix, '') || ' ' || content)`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chunks_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_tsv_gin_idx").using("gin", t.tsv),
    index("chunks_document_idx").on(t.documentId),
    index("chunks_collection_idx").on(t.collectionId),
    uniqueIndex("chunks_document_chunk_uq").on(t.documentId, t.chunkIndex),
  ],
);

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pgBossJobId: text("pg_boss_job_id"),
    stage: text("stage").notNull().default("queued"),
    progress: numeric("progress").notNull().default("0"),
    /** { chunks, tokens, embedCostUsd, contextualizeCostUsd } */
    stats: jsonb("stats").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingestion_jobs_document_idx").on(t.documentId)],
);

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** null = search all collections */
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("New conversation"),
    ...timestamps,
  },
  (t) => [index("conversations_user_idx").on(t.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    /** { rewrittenQuery, subQueries, candidateChunkIds, rerankScores } */
    retrievalDebug: jsonb("retrieval_debug"),
    /** { input: {...}, output: {...} } guardrail verdicts */
    guardrailFlags: jsonb("guardrail_flags"),
    model: text("model"),
    /** Anthropic usage object (input/output/cache tokens) */
    usage: jsonb("usage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId)],
);

export const messageCitations = pgTable(
  "message_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    citedText: text("cited_text").notNull(),
    startPage: integer("start_page"),
    endPage: integer("end_page"),
    /** 1-based display order of the citation chip */
    ordinal: integer("ordinal").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("citations_message_idx").on(t.messageId)],
);

export const feedbackRatingEnum = pgEnum("feedback_rating", ["up", "down"]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: feedbackRatingEnum("rating").notNull(),
    comment: text("comment"),
    promotedToEvalCase: boolean("promoted_to_eval_case").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_message_user_uq").on(t.messageId, t.userId)],
);

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export const evalCases = pgTable("eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
  expectedDocumentIds: uuid("expected_document_ids").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  gitRef: text("git_ref"),
  model: text("model").notNull(),
  /** { recallAt12, faithfulness, relevance, citationAccuracy, cases } */
  summary: jsonb("summary").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const evalResults = pgTable(
  "eval_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evalRuns.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => evalCases.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
    retrievalRecall: real("retrieval_recall"),
    faithfulness: real("faithfulness"),
    relevance: real("relevance"),
    citationAccuracy: real("citation_accuracy"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eval_results_run_idx").on(t.runId)],
);
