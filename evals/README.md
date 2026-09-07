# RAG eval harness

Measures retrieval and answer quality of the real pipeline (planQuery → hybrid retrieve → rerank → generate) against the golden cases in `golden.yaml`.

## Seed the fixture corpus

1. Start the stack (`npm run dev`, `npm run worker`, Postgres with migrations applied).
2. Upload every file in `evals/fixtures/` through the app UI (or an ingestion script) into one collection and wait until each document's status is **ready**.
3. Document titles must match the fixtures' H1s exactly (e.g. "Acme Deploy Guide") — cases resolve `expectedDocTitles` against `documents.title` and are warned-about/skipped when a title is missing.

## Run

```
DATABASE_URL=... ANTHROPIC_API_KEY=... VOYAGE_API_KEY=... npm run eval
```

Exits non-zero when mean recall@12 < 0.8 or mean faithfulness < 0.9 (or any case errors).

## Read the report

Each run writes `evals/reports/<iso-date>.md`: per-tag averages (single-hop / multi-hop / adversarial / out-of-kb), a per-case table, and every generated answer with judge reasoning. Results also persist to the `eval_runs` / `eval_results` tables for tracking over time.

## Feedback → new cases

Thumbs-down feedback lands in the `feedback` table linked to the message (see docs/TEST_PLAN.md and PRD). An admin promotes it to an `eval_cases` row ("Promote to eval case"), which future runs pick up alongside `golden.yaml`; fixes that need corpus changes update `evals/fixtures/` in the same PR.
