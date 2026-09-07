# KB-Chat — Product Requirements Document

Internal RAG knowledge-base chatbot for a single team. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the technical design, [USER_FLOWS.md](./USER_FLOWS.md) for flows, [TEST_PLAN.md](./TEST_PLAN.md) for verification.

## 1. Problem statement

Team knowledge is scattered across PDFs, docs sites, spreadsheets, and markdown files. Answering "how does X work?" means hunting through many sources; answers often span **multiple pages or documents**. Generic chatbots hallucinate and give no citations, so answers can't be trusted or verified. The team needs one place to upload knowledge and ask questions, with answers that are grounded, cited, and honest about what the knowledge base does not contain.

## 2. Target users

| User | Description | Needs |
|---|---|---|
| Team member | Anyone on the single internal team | Upload docs/URLs, ask questions, verify answers via citations |
| Admin | A team member with admin access | Review failed ingestion jobs, guardrail flags, doc health, promote feedback to eval cases |

One team, one deployment. No external users.

## 3. Goals / Non-goals

### Goals
- Upload documents (PDF, MD, TXT, DOCX, CSV) and crawl URLs into a shared knowledge base
- Chat answers grounded **only** in the knowledge base, with clickable citations to source pages
- High-quality retrieval even for multi-hop questions spanning documents
- Explicit "I don't know / not in the knowledge base" when the answer isn't there
- Security by default: untrusted-document handling, input/output guardrails, upload validation, rate limits
- Measurable quality via a day-one eval harness

### Non-goals (explicitly deferred, architected-for but not built)
| Non-goal | Status |
|---|---|
| Billing / payments | Deferred — internal tool, no monetization |
| Multi-tenancy / orgs | Deferred — single team only; schema stays single-tenant |
| Embeddable widget | Deferred — web app only for MVP |
| Analytics dashboards beyond admin basics | Deferred — layer in later |

## 4. User stories & acceptance criteria

| # | Story | Acceptance criteria | Status |
|---|---|---|---|
| US-1 | As a team member, I upload a document so the bot can answer from it | File validated (type allowlist, magic bytes, ≤50MB); status walks pending → parsing → chunking → embedding → ready with live progress; duplicate (same sha256, per collection) re-upload no-ops; ready doc is answerable | ✅ built (unit: validate/chunker; E2E spec) · ⏳ runtime |
| US-2 | As a team member, I add a docs-site URL so its pages are ingested | Crawl fetches pages as clean markdown (≤50 same-origin pages); each page becomes a document; failures surface as failed status with reason | ✅ built · ⏳ runtime |
| US-3 | As a team member, I ask a question and get a cited answer | Answer streams token-by-token; citation chips appear inline; clicking a chip opens the source viewer at the correct chunk/page | ✅ built (unit: citations; E2E spec) · ⏳ runtime |
| US-4 | As a team member, I ask a multi-hop question spanning documents | Query planner decomposes into sub-queries; answer synthesizes across docs and cites **every** source document used | ✅ built (integration: hybrid RRF; 8 multi-hop eval cases) · ⏳ runtime |
| US-5 | As a team member, I ask something outside the knowledge base | Bot replies with an explicit "not in the knowledge base" style answer — no fabrication, no fake citations | ✅ built (prompt rule + out-of-kb eval case) · ⏳ runtime |
| US-6 | As a team member, I give feedback on an answer | Thumbs up/down (with optional comment) persists to `feedback`, linked to the message | ✅ built (E2E spec) · ⏳ runtime |
| US-7 | As an admin, I review failed jobs and guardrail flags | Admin page lists failed ingestion jobs (with retry action) and guardrail flags (input/output gate hits) with the triggering text | ✅ built (admin tabs + `api/admin/*`) · ⏳ runtime |
| US-8 | As an admin, I promote a thumbs-down into an eval case | One action converts the question + expected behavior into a row in `eval_cases`, picked up by the next eval run | ✅ promote built (`api/admin/feedback/[id]/promote`) · ✅ harness runs active DB cases alongside `golden.yaml` (case activates after admin curation) · ⏳ runtime |

**Status legend (2026-08-29):** ✅ built = implemented in code with the noted automated coverage. ⏳ runtime = pending runtime verification — this machine has no database or provider API keys yet, so no end-to-end run (E2E suite, eval run, live ingestion) has been executed.

## 5. Quality bar

| Metric | Threshold | Measured by |
|---|---|---|
| Retrieval recall@12 | ≥ 0.8 | Eval harness, deterministic against golden chunk labels |
| Faithfulness (groundedness) | ≥ 0.9 | Eval harness, LLM-judge |
| p50 time to first streamed token | < 3s | Chat SSE instrumentation |
| Adversarial cases (prompt injection) | 0 successful | 3 adversarial golden eval cases |

`npm run eval` **fails** below the recall/faithfulness thresholds. The harness, thresholds, and CI gate (weekly cron + manual dispatch) are implemented in `evals/run.ts`; **no scored run has been executed yet** — blocked on a seeded database + API keys.

## 6. MVP scope by phase

| Phase | Scope | Key user-visible outcome | Status |
|---|---|---|---|
| 0 | Scaffold, docs, agent files, docker-compose, env validation | Dev server renders; DB container healthy | ✅ built |
| 1 | DB schema, auth, upload + validation, parsers, chunking, contextualization, embedding, worker, documents page | Sign up/in; upload a 30-page PDF and watch it reach ready; crawl a small docs site | ✅ built |
| 2 | Query planner, hybrid RRF retrieval, rerank, cited streaming generation, chat UI, source viewer, conversations | Ask single-doc and multi-hop questions; get cited streamed answers; out-of-KB → "I don't know" | ✅ built |
| 3 | Input/output guardrails, injection flagging, rate limits, eval harness, CI | Injection attempts refused and flagged; eval passes thresholds; 429 on rate limit | ✅ built |
| 4 | Polish (empty states, skeletons, a11y), feedback loop, admin page, logging, E2E | Feedback → eval case promotion; admin retry/flag review; full E2E journey green | ✅ built (incl. system-following dark mode with sidebar toggle) |

All phases are code-complete; runtime verification of every outcome above is ⏳ pending (no DB/API keys on this machine yet).

## 7. Success metrics

| Metric | Target |
|---|---|
| Eval thresholds (recall ≥ 0.8, faithfulness ≥ 0.9) | Passing on every eval run |
| End-to-end verification (upload → multi-hop cited answer) | Passing on a clean machine via `docker compose up` |
| Citation click-through works (chip → correct source page) | 100% in E2E suite |
| Answer feedback loop | Thumbs-down promotable to eval case in ≤ 2 clicks |
| Team adoption (post-launch) | Team members asking questions instead of manual doc search |
