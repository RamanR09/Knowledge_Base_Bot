# KB-Chat — Test Plan

Quality bar: [PRD.md](./PRD.md#5-quality-bar) · Pipeline under test: [ARCHITECTURE.md](./ARCHITECTURE.md) · Journeys: [USER_FLOWS.md](./USER_FLOWS.md)

## The four layers

| Layer | Tool | Covers | Needs |
|---|---|---|---|
| Unit | Vitest (`tests/unit`, `npm run test`) | Pure logic: chunker, RRF math, citation mapping, validators, guardrail heuristics | Nothing external |
| Integration | Vitest + `@testcontainers/postgresql` (`tests/integration`, `npm run test:integration`) | Real SQL against pgvector/tsvector: hybrid search, schema, status machine, queue | Container runtime |
| E2E | Playwright (`tests/e2e`, `npm run test:e2e`) | Full browser journeys against a running app + worker + db | Full stack up |
| RAG eval harness | `evals/` (`npm run eval`) | Real retrieve + generate quality against `evals/golden.yaml` | API keys + seeded fixture corpus |

## Layer 1 — Vitest unit

| Area (file in `tests/unit/`) | Concrete cases |
|---|---|
| Chunker (`chunker.test.ts`) | Heading-path stack (h1>h2>h3, sibling pop); content never merged across h1/h2; ~600-tok target / 1000-tok hard max; within-section overlap carry-over; page ranges → pageStart/pageEnd; sequential chunkIndex; empty/whitespace input → [] |
| Citation mapping (`citations.test.ts`) | `documentIndex` maps to the chunk at that request position; stable 1-based ordinals by first appearance; dedupe by (chunkId, citedText); out-of-range indexes skipped safely; page range pass-through |
| Context budget (`rag-fixtures.test.ts`) | `fitChunksToBudget`: order-preserving tail trim at the ~10K estimated-token cap; first chunk always kept; input never mutated |
| Validators (`validate.test.ts`) | Magic bytes vs extension mismatch rejected (PDF renamed .md, non-PDF bytes as .pdf); NUL bytes in "text" rejected; >50MB and empty files rejected; extension allowlist; MIME-consistency gate; sha256 stability |
| Guardrail patterns (`guardrails-patterns.test.ts`, `guardrails-output.test.ts`) | Injection regexes hit known patterns; secret signatures (Anthropic/AWS/GitHub/PEM/Slack); uncited-long-answer flag incl. curly-apostrophe "not found" phrasings; clean prose not flagged |
| Ingest sanitizer (`sanitize.test.ts`) | Zero-width/bidi/BOM stripping; normal unicode preserved; injection detected only after de-hiding |

Not yet unit-covered: query-planner output parsing (the zod validation + raw-query fallback in `queryPlanner.ts` has no dedicated test); RRF scoring math is exercised at the SQL level in integration rather than as a pure unit.

## Layer 2 — testcontainers integration

Real `pgvector/pgvector:pg17` container (`container.ts` applies `src/db/migrations/`), fixture chunks with **pre-computed seeded vectors** (no live embedding calls).

| Case (file in `tests/integration/`) | Assertion |
|---|---|
| Migrations (`migrations.test.ts`) | All key tables created; HNSW index on `embedding` + GIN index on `tsv` exist; generated `tsv` populates from content + context prefix |
| Hybrid search (`hybrid-search.test.ts`) | Vector-only and text-only hits each surface through their arm; RRF fusion — a dual-arm hit outranks single-arm hits; chunk metadata round-trips; collection filter applies to both arms; multi-sub-query merge dedupes by chunk, keeps best score, caps the pool |
| pg-boss (`pgboss.test.ts`) | Enqueue → worker handler receives the payload → job marked completed |

Not yet integration-covered: status-machine persistence, `content_hash` dedupe at the SQL level, `message_citations` FK integrity, pg-boss retry/backoff exhaustion, index usage in query plans.

## Layer 3 — Playwright E2E

Implemented specs (the full stack — migrated DB, worker, dev server — must be running first; `playwright.config.ts` deliberately has no `webServer` autostart):

- `journey.spec.ts` (serial, the Phase 4 gate): **sign up → create collection → upload fixture doc → status walks to ready → ask a golden question → streamed grounded answer renders → citation chip opens the source viewer with the document title → thumbs-down with comment → confirmation toast**.
- `auth.spec.ts`: login failure shows an inline error and stays on the form; unauthenticated visit to a protected route redirects to `/login`.

Not yet automated: invalid/oversized file rejection on the dropzone, out-of-KB question rendering, rate-limit 429 surfacing, admin retries a failed job, admin promotes feedback to eval case.

## Layer 4 — RAG eval harness

`evals/golden.yaml`: **25 golden cases** — 14 single-hop, **8 multi-hop** (answer spans ≥2 documents; must cite all), **3 adversarial** (direct injection in query; planted in-doc injection must have no effect; out-of-KB question must produce "I don't know" with zero fabricated citations).

`npm run eval` runs the real pipeline (planQuery → hybrid retrieve → rerank → generate) against the **ingested Acme fixture corpus** (`evals/fixtures/`, five markdown docs matched by document title), persists `eval_runs`/`eval_results`, and emits a markdown report to `evals/reports/<date>.md`. Cases whose expected fixtures aren't ingested are skipped with a warning; any errored case fails the run.

| Metric | Method | Threshold |
|---|---|---|
| Retrieval recall@12 | Deterministic: fraction of expected documents among the docs of the top-12 reranked chunks | ≥ 0.8 (hard fail) |
| Faithfulness | LLM-judge (`judges.ts`, forced-tool structured score) | ≥ 0.9 (hard fail) |
| Answer relevance | LLM-judge | Reported, tracked over time |
| Citation accuracy | Deterministic: fraction of cited documents that are expected; expected-empty cases (out-of-kb, direct injection) score 1.0 only when nothing is cited | Reported per-tag |
| Adversarial / out-of-kb | Same metrics — correct behavior is a grounded refusal with zero fabricated citations | 0 successful attacks |

## When each suite runs

| Suite | Per commit (CI) | Nightly / manual | Phase gates |
|---|---|---|---|
| Lint + `tsc --noEmit` | ✅ | — | All |
| Vitest unit | ✅ | — | All |
| testcontainers integration | ✅ | — | 1+ |
| Playwright E2E | — | Manual + pre-release (not in CI — needs the full stack) | 4 |
| RAG eval harness | — | Weekly CI cron (Mon 06:00 UTC) + manual dispatch; **mandatory after any change under `src/lib/rag` or `src/lib/ingestion`** | 3+ |

E2E and evals stay off the per-commit path (cost/latency/API keys); eval threshold failures block merge of the triggering RAG change.

## Feedback → eval cases

1. Thumbs-down lands in `feedback` linked to the message (question, answer, `retrieval_debug`, citations).
2. Admin reviews it and clicks **Promote to eval case** → a row in `eval_cases` capturing the question, expected grounding behavior, and (when identifiable) golden chunk/doc labels from the retrieval debug.
3. Promoted rows land in `eval_cases` with `active = false`; once an admin curates the expected answer and sets the case active, `evals/run.ts` runs it alongside the `golden.yaml` seeds (DB cases with `active = true` are added to every run) — real-user regressions become permanent regression tests.
4. Cases whose fix requires corpus changes get fixture updates in `evals/fixtures/` in the same PR.
