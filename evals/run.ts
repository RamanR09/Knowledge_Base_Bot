/**
 * KB-Chat RAG eval harness — `npm run eval` (tsx evals/run.ts).
 *
 * Prerequisites:
 *   1. A running Postgres with the app schema migrated (DATABASE_URL).
 *   2. ANTHROPIC_API_KEY and VOYAGE_API_KEY set.
 *   3. The fixture corpus in evals/fixtures/ already INGESTED: upload each
 *      markdown file through the app UI (or an ingestion script) so a `documents`
 *      row exists whose title exactly matches the H1 (e.g. "Acme Deploy Guide")
 *      and whose status is "ready". Cases whose expected documents are not
 *      ingested are warned about and skipped.
 *
 * For each golden case it runs the real pipeline (planQuery → retrieveForQuestion
 * → rerankChunks → fitChunksToBudget → generateAnswer), computes retrieval
 * recall@12 deterministically, judges faithfulness/relevance with the LLM
 * judges, persists eval_runs/eval_results rows, prints a per-tag summary, and
 * writes a markdown report to evals/reports/<iso-date>.md.
 *
 * Exit code is non-zero when mean recall@12 < 0.8 or mean faithfulness < 0.9.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

/* ----------------------------- golden.yaml ----------------------------- */

const tagSchema = z.enum(["single-hop", "multi-hop", "adversarial", "out-of-kb"]);

const caseSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expectedAnswer: z.string().min(1),
  expectedDocTitles: z.array(z.string().min(1)),
  tags: z.array(tagSchema).min(1),
});

const goldenSchema = z.object({ cases: z.array(caseSchema).min(1) });

type Tag = z.infer<typeof tagSchema>;
type GoldenCase = z.infer<typeof caseSchema>;

const ALL_TAGS: Tag[] = ["single-hop", "multi-hop", "adversarial", "out-of-kb"];
const RECALL_K = 12;
const CONCURRENCY = 3;
const RECALL_THRESHOLD = 0.8;
const FAITHFULNESS_THRESHOLD = 0.9;

/* ------------------------------ env gate ------------------------------- */

function assertEnvOrExit(): void {
  const required = ["DATABASE_URL", "ANTHROPIC_API_KEY", "VOYAGE_API_KEY"] as const;
  const missing = required.filter((key) => {
    const value = process.env[key];
    return value === undefined || value === "";
  });
  if (missing.length > 0) {
    console.error(
      `[eval] Missing required environment variables: ${missing.join(", ")}\n` +
        "[eval] The eval harness needs a Postgres database containing the ingested\n" +
        "[eval] fixture corpus plus Anthropic and Voyage API keys. See evals/README.md.",
    );
    process.exit(1);
  }
  // The eval harness never touches auth, but src/lib/env.ts validates the full
  // schema at import time — give BETTER_AUTH_SECRET a placeholder if unset.
  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = "eval-harness-placeholder-secret";
  }
}

/* ---------------------------- promise pool ------------------------------ */

async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await worker(item, index);
    }
  });
  await Promise.all(lanes);
  return results;
}

/* ------------------------------- results -------------------------------- */

interface CaseResult {
  goldenCase: GoldenCase;
  status: "ok" | "skipped" | "error";
  error?: string;
  expectedDocumentIds: string[];
  retrievedDocumentIds: string[];
  citedDocumentIds: string[];
  answer: string;
  citationCount: number;
  recall: number | null;
  citationAccuracy: number | null;
  faithfulness: number | null;
  relevance: number | null;
  faithfulnessReasoning?: string;
  relevanceReasoning?: string;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

function collect(results: CaseResult[], pick: (r: CaseResult) => number | null): number[] {
  return results.flatMap((r) => {
    const v = pick(r);
    return v === null ? [] : [v];
  });
}

/* --------------------------------- main --------------------------------- */

async function main(): Promise<void> {
  assertEnvOrExit();

  // Imported dynamically so the friendly env check above runs before
  // src/lib/env.ts (imported transitively by everything below) validates env.
  const [{ db, schema }, drizzle, retrieveMod, plannerMod, rerankMod, generateMod, citationsMod, judges, anthropicMod] =
    await Promise.all([
      import("@/db"),
      import("drizzle-orm"),
      import("@/lib/rag/retrieve"),
      import("@/lib/rag/queryPlanner"),
      import("@/lib/rag/rerankChunks"),
      import("@/lib/rag/generate"),
      import("@/lib/rag/citations"),
      import("./judges"),
      import("@/lib/llm/anthropic"),
    ]);
  const { inArray, eq } = drizzle;
  const { planQuery } = plannerMod;
  const { retrieveForQuestion } = retrieveMod;
  const { rerankChunks } = rerankMod;
  const { fitChunksToBudget, generateAnswer } = generateMod;
  const { mapCitations } = citationsMod;
  const { MODELS } = anthropicMod;
  type CitationEvent = import("@/lib/rag/citations").CitationEvent;

  /* Load + validate golden.yaml. */
  const goldenPath = path.join(EVALS_DIR, "golden.yaml");
  const golden = goldenSchema.parse(parseYaml(readFileSync(goldenPath, "utf8")));
  console.log(`[eval] Loaded ${golden.cases.length} golden cases from ${goldenPath}`);

  /* Resolve expectedDocTitles → documentIds (fixtures are matched by title). */
  const allTitles = [...new Set(golden.cases.flatMap((c) => c.expectedDocTitles))];
  const docRows =
    allTitles.length > 0
      ? await db
          .select({
            id: schema.documents.id,
            title: schema.documents.title,
            status: schema.documents.status,
          })
          .from(schema.documents)
          .where(inArray(schema.documents.title, allTitles))
      : [];
  const titleToDocId = new Map<string, string>();
  for (const row of docRows) {
    if (row.status === "ready") titleToDocId.set(row.title, row.id);
  }
  for (const title of allTitles) {
    if (!titleToDocId.has(title)) {
      console.warn(
        `[eval] WARNING: document titled "${title}" is not ingested (or not ready); ` +
          "cases expecting it will be skipped. Ingest evals/fixtures/ first.",
      );
    }
  }

  const activeCases: { goldenCase: GoldenCase; expectedDocumentIds: string[] }[] = [];
  const skipped: CaseResult[] = [];
  for (const goldenCase of golden.cases) {
    const resolved = goldenCase.expectedDocTitles.map((t) => titleToDocId.get(t));
    if (resolved.some((id) => id === undefined)) {
      console.warn(`[eval] skipping case ${goldenCase.id}: expected document(s) missing`);
      skipped.push({
        goldenCase,
        status: "skipped",
        error: "expected document(s) not ingested",
        expectedDocumentIds: [],
        retrievedDocumentIds: [],
        citedDocumentIds: [],
        answer: "",
        citationCount: 0,
        recall: null,
        citationAccuracy: null,
        faithfulness: null,
        relevance: null,
      });
      continue;
    }
    activeCases.push({
      goldenCase,
      expectedDocumentIds: resolved as string[],
    });
  }
  /* Also run curated DB eval cases (e.g. promoted from feedback, then marked
   * active by an admin). Golden questions take precedence over duplicates. */
  const goldenQuestions = new Set(golden.cases.map((c) => c.question));
  const dbCaseRows = await db
    .select()
    .from(schema.evalCases)
    .where(eq(schema.evalCases.active, true));
  let dbCaseCount = 0;
  for (const row of dbCaseRows) {
    if (goldenQuestions.has(row.question)) continue;
    const tags = row.tags.filter((t): t is Tag => (ALL_TAGS as string[]).includes(t));
    activeCases.push({
      goldenCase: {
        id: `db-${row.id.slice(0, 8)}`,
        question: row.question,
        expectedAnswer:
          row.expectedAnswer || "(curated case — no expected answer recorded)",
        expectedDocTitles: [],
        tags: tags.length > 0 ? tags : ["single-hop"],
      },
      expectedDocumentIds: row.expectedDocumentIds,
    });
    dbCaseCount += 1;
  }
  if (dbCaseCount > 0) {
    console.log(`[eval] Added ${dbCaseCount} active curated case(s) from the database`);
  }
  const totalCases = golden.cases.length + dbCaseCount;

  if (activeCases.length === 0) {
    console.error("[eval] No runnable cases — ingest the fixture corpus first (see evals/README.md).");
    process.exit(1);
  }

  /* Upsert eval_cases (matched by question text) so results can reference them. */
  const questions = activeCases.map((a) => a.goldenCase.question);
  const existingCases = await db
    .select({ id: schema.evalCases.id, question: schema.evalCases.question })
    .from(schema.evalCases)
    .where(inArray(schema.evalCases.question, questions));
  const questionToCaseId = new Map(existingCases.map((r) => [r.question, r.id]));
  for (const active of activeCases) {
    if (questionToCaseId.has(active.goldenCase.question)) continue;
    const [inserted] = await db
      .insert(schema.evalCases)
      .values({
        question: active.goldenCase.question,
        expectedAnswer: active.goldenCase.expectedAnswer,
        expectedDocumentIds: active.expectedDocumentIds,
        tags: active.goldenCase.tags,
      })
      .returning({ id: schema.evalCases.id });
    if (inserted) questionToCaseId.set(active.goldenCase.question, inserted.id);
  }

  /* Open the run row. */
  let gitRef: string | null = null;
  try {
    gitRef = execSync("git rev-parse --short HEAD", {
      cwd: EVALS_DIR,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // not a git checkout — fine
  }
  const [runRow] = await db
    .insert(schema.evalRuns)
    .values({ model: MODELS.generation, gitRef })
    .returning({ id: schema.evalRuns.id });
  if (!runRow) throw new Error("failed to insert eval_runs row");
  const runId = runRow.id;
  console.log(`[eval] run ${runId} (model=${MODELS.generation}, git=${gitRef ?? "n/a"})`);

  /* Execute cases, 3 at a time. */
  const results = await runPool(activeCases, CONCURRENCY, async (active): Promise<CaseResult> => {
    const { goldenCase, expectedDocumentIds } = active;
    try {
      /* Retrieval. */
      const plan = await planQuery([], goldenCase.question);
      const pool = await retrieveForQuestion(plan.subQueries);
      const ranked = await rerankChunks(goldenCase.question, pool, RECALL_K);
      const top = ranked.slice(0, RECALL_K);
      const retrievedDocumentIds = [...new Set(top.map((c) => c.documentId))];

      /* recall@12: fraction of expected docs present in the top-K chunk docs. */
      const recall =
        expectedDocumentIds.length === 0
          ? null
          : expectedDocumentIds.filter((id) => retrievedDocumentIds.includes(id)).length /
            expectedDocumentIds.length;

      /* Generation over the exact budget-fitted chunk list (defines document_index). */
      const fitted = fitChunksToBudget(top);
      const citationEvents: CitationEvent[] = [];
      let answer = "";
      for await (const event of generateAnswer({
        question: goldenCase.question,
        history: [],
        chunks: fitted,
      })) {
        if (event.type === "citation") {
          citationEvents.push({
            documentIndex: event.documentIndex,
            citedText: event.citedText,
          });
        } else if (event.type === "done") {
          answer = event.fullText;
        }
      }
      const citationRecords = mapCitations(citationEvents, fitted);
      const citedDocumentIds = [...new Set(citationRecords.map((r) => r.documentId))];

      /* Citation accuracy. When no documents are expected (out-of-kb / direct
       * injection), a correct answer cites nothing → 1.0, anything cited → 0.
       * Otherwise: fraction of cited documents that are expected (0 when a
       * grounded case produced no citations at all). */
      let citationAccuracy: number;
      if (expectedDocumentIds.length === 0) {
        citationAccuracy = citationRecords.length === 0 ? 1 : 0;
      } else if (citedDocumentIds.length === 0) {
        citationAccuracy = 0;
      } else {
        citationAccuracy =
          citedDocumentIds.filter((id) => expectedDocumentIds.includes(id)).length /
          citedDocumentIds.length;
      }

      /* Judges. Sources = the chunk contents actually given to the generator. */
      const sourcesText = fitted
        .map((c) => `[${c.documentTitle}]\n${c.content}`)
        .join("\n\n---\n\n");
      const [faithfulness, relevance] = await Promise.all([
        judges.judgeFaithfulness(goldenCase.question, answer, sourcesText),
        judges.judgeRelevance(goldenCase.question, answer),
      ]);

      console.log(
        `[eval] ${goldenCase.id}: recall=${fmt(recall)} faith=${faithfulness.score.toFixed(2)} ` +
          `rel=${relevance.score.toFixed(2)} citAcc=${citationAccuracy.toFixed(2)} ` +
          `citations=${citationRecords.length}`,
      );

      return {
        goldenCase,
        status: "ok",
        expectedDocumentIds,
        retrievedDocumentIds,
        citedDocumentIds,
        answer,
        citationCount: citationRecords.length,
        recall,
        citationAccuracy,
        faithfulness: faithfulness.score,
        relevance: relevance.score,
        faithfulnessReasoning: faithfulness.reasoning,
        relevanceReasoning: relevance.reasoning,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eval] ${goldenCase.id}: ERROR — ${message}`);
      return {
        goldenCase,
        status: "error",
        error: message,
        expectedDocumentIds,
        retrievedDocumentIds: [],
        citedDocumentIds: [],
        answer: "",
        citationCount: 0,
        recall: null,
        citationAccuracy: null,
        faithfulness: null,
        relevance: null,
      };
    }
  });

  /* Persist per-case results. */
  for (const result of results) {
    if (result.status !== "ok") continue;
    const caseId = questionToCaseId.get(result.goldenCase.question);
    if (!caseId) continue;
    await db.insert(schema.evalResults).values({
      runId,
      caseId,
      answer: result.answer,
      retrievalRecall: result.recall,
      faithfulness: result.faithfulness,
      relevance: result.relevance,
      citationAccuracy: result.citationAccuracy,
      details: {
        goldenId: result.goldenCase.id,
        tags: result.goldenCase.tags,
        expectedDocTitles: result.goldenCase.expectedDocTitles,
        expectedDocumentIds: result.expectedDocumentIds,
        retrievedDocumentIds: result.retrievedDocumentIds,
        citedDocumentIds: result.citedDocumentIds,
        citationCount: result.citationCount,
        faithfulnessReasoning: result.faithfulnessReasoning,
        relevanceReasoning: result.relevanceReasoning,
      },
    });
  }

  /* Summaries. */
  const allResults = [...results, ...skipped];
  const okResults = results.filter((r) => r.status === "ok");
  const errored = results.filter((r) => r.status === "error");
  const meanRecall = mean(collect(okResults, (r) => r.recall));
  const meanFaithfulness = mean(collect(okResults, (r) => r.faithfulness));
  const meanRelevance = mean(collect(okResults, (r) => r.relevance));
  const meanCitationAccuracy = mean(collect(okResults, (r) => r.citationAccuracy));

  interface TagRow {
    tag: string;
    cases: number;
    recall: number | null;
    faithfulness: number | null;
    relevance: number | null;
    citationAccuracy: number | null;
  }
  const tagRows: TagRow[] = ALL_TAGS.map((tag) => {
    const tagged = okResults.filter((r) => r.goldenCase.tags.includes(tag));
    return {
      tag,
      cases: tagged.length,
      recall: mean(collect(tagged, (r) => r.recall)),
      faithfulness: mean(collect(tagged, (r) => r.faithfulness)),
      relevance: mean(collect(tagged, (r) => r.relevance)),
      citationAccuracy: mean(collect(tagged, (r) => r.citationAccuracy)),
    };
  });

  console.log("\n=== Eval summary ===");
  console.log(
    `cases: ${totalCases} total, ${okResults.length} ok, ` +
      `${skipped.length} skipped, ${errored.length} errored`,
  );
  const header = ["tag", "cases", "recall@12", "faithfulness", "relevance", "citationAcc"];
  const rows = [
    ...tagRows.map((r) => [r.tag, String(r.cases), fmt(r.recall), fmt(r.faithfulness), fmt(r.relevance), fmt(r.citationAccuracy)]),
    ["ALL", String(okResults.length), fmt(meanRecall), fmt(meanFaithfulness), fmt(meanRelevance), fmt(meanCitationAccuracy)],
  ];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? c.length)).join("  ");
  console.log(line(header));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const row of rows) console.log(line(row));

  const summary = {
    recallAt12: meanRecall,
    faithfulness: meanFaithfulness,
    relevance: meanRelevance,
    citationAccuracy: meanCitationAccuracy,
    cases: okResults.length,
    skipped: skipped.length,
    errored: errored.length,
  };
  await db
    .update(schema.evalRuns)
    .set({ summary, finishedAt: new Date() })
    .where(eq(schema.evalRuns.id, runId));

  /* Markdown report. */
  const reportsDir = path.join(EVALS_DIR, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const isoDate = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(reportsDir, `${isoDate}.md`);
  const reportLines: string[] = [
    `# RAG eval report — ${isoDate}`,
    "",
    `- Run id: \`${runId}\``,
    `- Model: \`${MODELS.generation}\``,
    `- Git ref: \`${gitRef ?? "n/a"}\``,
    `- Cases: ${totalCases} total / ${okResults.length} ok / ${skipped.length} skipped / ${errored.length} errored`,
    "",
    "## Per-tag averages",
    "",
    "| Tag | Cases | Recall@12 | Faithfulness | Relevance | Citation accuracy |",
    "|---|---|---|---|---|---|",
    ...tagRows.map(
      (r) =>
        `| ${r.tag} | ${r.cases} | ${fmt(r.recall)} | ${fmt(r.faithfulness)} | ${fmt(r.relevance)} | ${fmt(r.citationAccuracy)} |`,
    ),
    `| **ALL** | ${okResults.length} | **${fmt(meanRecall)}** | **${fmt(meanFaithfulness)}** | ${fmt(meanRelevance)} | ${fmt(meanCitationAccuracy)} |`,
    "",
    `Thresholds: recall@12 ≥ ${RECALL_THRESHOLD} (hard fail), faithfulness ≥ ${FAITHFULNESS_THRESHOLD} (hard fail).`,
    "",
    "## Per-case results",
    "",
    "| Case | Tags | Status | Recall@12 | Faithfulness | Relevance | CitAcc | Citations |",
    "|---|---|---|---|---|---|---|---|",
    ...allResults.map(
      (r) =>
        `| ${r.goldenCase.id} | ${r.goldenCase.tags.join(", ")} | ${r.status}${r.error ? ` (${r.error})` : ""} | ` +
        `${fmt(r.recall)} | ${fmt(r.faithfulness)} | ${fmt(r.relevance)} | ${fmt(r.citationAccuracy)} | ${r.citationCount} |`,
    ),
    "",
    "## Answers",
    "",
    ...okResults.flatMap((r) => [
      `### ${r.goldenCase.id}`,
      "",
      `**Q:** ${r.goldenCase.question}`,
      "",
      `**A:** ${r.answer}`,
      "",
      r.faithfulnessReasoning ? `**Faithfulness judge:** ${r.faithfulnessReasoning}` : "",
      r.relevanceReasoning ? `**Relevance judge:** ${r.relevanceReasoning}` : "",
      "",
    ]),
  ];
  writeFileSync(reportPath, reportLines.join("\n"));
  console.log(`\n[eval] report written to ${reportPath}`);

  /* Gate. */
  const failures: string[] = [];
  if (meanRecall !== null && meanRecall < RECALL_THRESHOLD) {
    failures.push(`mean recall@12 ${fmt(meanRecall)} < ${RECALL_THRESHOLD}`);
  }
  if (meanFaithfulness !== null && meanFaithfulness < FAITHFULNESS_THRESHOLD) {
    failures.push(`mean faithfulness ${fmt(meanFaithfulness)} < ${FAITHFULNESS_THRESHOLD}`);
  }
  if (errored.length > 0) {
    failures.push(`${errored.length} case(s) errored`);
  }
  if (failures.length > 0) {
    console.error(`\n[eval] FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("\n[eval] PASS: all thresholds met");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[eval] fatal:", error);
  process.exit(1);
});
