# Judge's evidence guide

Start with the [live Vercel exercise](https://hydrogrid-response.vercel.app/) or the [walkthrough](demo.md). The [Codex Evidence Pack](evidence/CODEX_EVIDENCE_PACK.md) preserves the development timeline, actual prompt excerpts and individual records for the eight stages in the supplied competition brief. The [comprehensive judging matrix](evidence/TRACEABILITY_MATRIX.md#judging-criteria) links the scope, source, architecture and verification for all five criteria.

## Lifecycle coverage and depth · 30

| Stage | What to inspect |
| --- | --- |
| [Understand](evidence/lifecycle/01-understand.md) | The original brief, offline and routing constraints, and the separation between exercise and public source data. |
| [Plan](evidence/lifecycle/02-plan.md) | Combined and split architectures, deterministic engine, stable offline operation IDs and PostGIS transaction boundaries. |
| [Build](evidence/lifecycle/03-build.md) | Initial source commits and the 2.0 PR for dashboards, citizen accounts and workspace ownership. |
| [Test](evidence/lifecycle/04-test.md) | Maven/PostGIS tests, Playwright, accessibility matrix and reproducible simulated dispatch comparisons. |
| [Review](evidence/lifecycle/05-review.md) | Independent source workstream, recorded findings, corrections and verification scope. |
| [Document](evidence/lifecycle/06-document.md) | Repository README, setup, API, judge walkthrough and linked Evidence Pack. |
| [Ship](evidence/lifecycle/07-ship.md) | Compose, public Vercel and Render/Neon, release SHA, health and rollback evidence. |
| [Automate](evidence/lifecycle/08-automate.md) | GitHub Actions, provider integration, runtime synchronization, deterministic benchmark runner and persistent `AGENTS.md`. |

## Codex capability use and fit · 25

Separate engine, API and UI agents worked against versioned contracts. The root verified integration with PostGIS and Chromium. See which capability produced each result, its rationale and oversight in the [capability matrix](evidence/CAPABILITY_MATRIX.md).

## Model and reasoning-effort discipline · 20

Historical root and subagent metadata records `gpt-6.2-sol` at `ultra`. Subagents inherited that configuration. The [model decision log](evidence/MODEL_DECISION_LOG.md) records actual tasks, risk, controls and outcomes. The observed run used one model and effort.

## Working result and engineering craft · 15

The exercise demonstrates offline report and responder action replay, scoped STOMP, transactional dispatch/admission, hazard-avoiding routes and dashboard drill-down. Use the [testing report](testing.md), [review findings](evidence/REVIEW_FINDINGS.md), [split release CI](https://github.com/Manu577228/HydroGrid/actions/runs/45970866151), and [deployment record](deployment.md) to inspect the exact verification scope.

## Problem worth solving and originality · 10

Flood response combines late reports, roads that can become inaccessible, and units with different equipment and capacity. HydroGrid makes those decisions observable in one replayable exercise, with separate sourced public context. In seed `1337`, HydroGrid serves 14 of 14 critical incidents versus FIFO's 13 of 14 while average response time for served incidents rises from 33.72 to 34.16 simulated minutes. In seed `7`, the HydroGrid mean drops and four more incidents go unserved. Check all seeds, denominators and methods in the [benchmark report](benchmarks.md).

[Full requirement-to-evidence traceability](evidence/TRACEABILITY_MATRIX.md)
