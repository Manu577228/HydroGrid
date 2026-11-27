# HydroGrid 2.0 Codex evidence pack

HydroGrid lets a judge rehearse how a citizen report travels through a flood-response system with unreliable connectivity. A browser-owned workspace links a queued SOS, a confirmed dispatch, a responder journey and shelter admission to an audit trail. Its separate Bengaluru view displays sourced geographic and environmental data. All rescue outcomes in the exercise are simulated.

[Public repository](https://github.com/Manu577228/HydroGrid) · [Live exercise](https://hydrogrid-demo-7v9f.onrender.com/) · [Judge walkthrough](../demo.md) · [Persistent Codex instructions](../../AGENTS.md) · [Capability matrix](CAPABILITY_MATRIX.md) · [Model decision log](MODEL_DECISION_LOG.md) · [Review findings](REVIEW_FINDINGS.md) · [Traceability matrix](TRACEABILITY_MATRIX.md)

## Competition scope

The participant's *1-Month Build Challenge — Build with Codex* submission brief specifies a new, solo project, complete public source and meaningful Git history, persistent `AGENTS.md`, automated tests, a runnable release, reproducible setup and a credential-safe Evidence Pack. The brief requires real Codex capability use and actual model and reasoning records covering **Understand**, **Plan**, **Build**, **Test**, **Review**, **Document**, **Ship**, and **Automate**. It gives the following rubric.

| Criterion | Points available | Audit entry point |
| --- | ---: | --- |
| Lifecycle Coverage and Depth | 30 | [Eight stages](#understand) and [traceability](TRACEABILITY_MATRIX.md) |
| Codex Capability Use and Fit | 25 | [Capability matrix](CAPABILITY_MATRIX.md) |
| Model and Reasoning Discipline | 20 | [Decision log](MODEL_DECISION_LOG.md) |
| Working Result and Engineering Craft | 15 | [Test](#test), [review](#review) and [live exercise](https://hydrogrid-demo-7v9f.onrender.com/) |
| Problem Worth Solving and Originality | 10 | [Understand](#understand), [Plan](#plan) and [controlled comparisons](../benchmarks.md) |

The supplied brief is the source of the stage names and rubric used here. Organizer eligibility and solo-participant status require the participant's attestation. Public source, history, tests and release remain directly inspectable.

## Development timeline

Dates and times use Bengaluru time (IST). The commit links preserve the original chronology. This pack organizes the historical artifacts under the stage names requested for submission.

| When | Milestone | Durable evidence |
| --- | --- | --- |
| 26 Nov 2026, 23:11 | Original build request and scope | [P1](#recorded-prompt-excerpts) · [D1](MODEL_DECISION_LOG.md) |
| 26 Nov, 23:20–23:32 | Scaffold, engine, spatial API, offline browser, tests, benchmarks and startup probe correction | [Scaffold](https://github.com/Manu577228/HydroGrid/commit/8214ee577bec0b8b5e1c247532d055749d398d08) · [test automation](https://github.com/Manu577228/HydroGrid/commit/64b7d16ba3e392f80990eef7d9e810278106a79d) · [probe fix](https://github.com/Manu577228/HydroGrid/commit/8df1d6a61e8f6337c480c38211baec1a0a4d00f3) |
| 27 Nov, 00:16–00:57 | Neon skills and hosted switch, visual polish, offline responder coverage and first evidence map | [Neon cutover](https://github.com/Manu577228/HydroGrid/commit/ea9a2df98013966656fb65918270227a144e763d) · [offline responder release](https://github.com/Manu577228/HydroGrid/commit/dbd75625263bb1d5e0bfb37417b3e0ebbedf426a) · [first evidence map](https://github.com/Manu577228/HydroGrid/commit/7dd5c064e41a7030b8167eb7dcab2f33b07d7645) |
| 27 Nov, 01:08–01:44 | Public Bengaluru source layer and privately scoped workflows | [Sourced geography](https://github.com/Manu577228/HydroGrid/commit/9fc76a0f84045d2ec656ac3801b9384fc2de96c3) · [agency and traffic integration](https://github.com/Manu577228/HydroGrid/commit/920716d1c524f55fd8e5af2d416bb48a7152e2af) |
| 27 Nov, 02:01–02:36 | 2.0 brief, citizen auth, owner proof, dashboard and first reviewed merge | [2.0 PR](https://github.com/Manu577228/HydroGrid/pull/1) · [release notes](../release-2.0.md) |
| 27 Nov, 09:42 | Keyboard regression correction merged after release verification | [Fix PR](https://github.com/Manu577228/HydroGrid/pull/2) · [deployed SHA](https://github.com/Manu577228/HydroGrid/commit/940edb064d90053414370addb871f6b33e997e93) · [release CI](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) |
| 27 Nov, from 10:00 | Final competition audit and evidence consolidation | [P6](#recorded-prompt-excerpts) · [D6](MODEL_DECISION_LOG.md) · [findings](REVIEW_FINDINGS.md) |

## Recorded prompt excerpts

These excerpts come from participant-supplied briefs or messages. IDs below refer to prompts that were actually received. The pack omits private access details and unrelated portions of the session.

| ID and context | Exact excerpt |
| --- | --- |
| P1 · Original supplied design brief, 26 Nov | “Remember our constraint: 4 hours to build, 24 hours to submit.” “Rather than building another emergency reporting dashboard, we should build a disaster response decision-support system that continues functioning under degraded network conditions.” |
| P2 · Original architecture and test brief, 26 Nov | “Clustering: Nearby SOS reports do not necessarily represent the same victims. Never automatically merge their headcounts without confirmation.” “Prove offline reliability, safe dispatch and routing behavior.” |
| P3 · Database tooling request, 27 Nov | “Check whether Neon agent skills and the Neon MCP server are already installed for this project, install anything missing, preserve my existing configuration, and summarize every change you make.” |
| P4 · 2.0 brief, sections 9 and 25, 27 Nov | “Publish events only after successful database transactions.” “Scope events to authorized workspaces.” “Run baseline tests before changes.” |
| P5 · 2.0 brief, section 28, 27 Nov | “You are NOT authorized to weaken security or workspace isolation.” “Work incrementally using focused Git commits.” |
| P6 · Final competition brief, sections 28, 32 and 48, 27 Nov | “Use real session records and existing documentation.” “Perform a fresh review of the completed application.” “Do not push or merge without human approval.” |

The participant also approved the earlier deployment and raised the data-quality requirement for current Bengaluru conditions. The [release notes](../release-2.0.md) and [operations guide](../operations.md) explain how those requests affected the implementation and deployment. The captured [ImageGen prompt](CAPABILITY_MATRIX.md#original-landing-artwork) is separate from the product prompts.

## Understand

- **Objective and inputs.** Identify the gaps between receiving a flood report, deciding whether a unit can reach it, and tracking a handoff. The brief named residents, dispatch coordinators, responders and shelter operators. It required a short implementation window, free hosting, unreliable-network behavior and synthetic exercise data. [P1](#recorded-prompt-excerpts) · [P2](#recorded-prompt-excerpts)
- **Codex and configuration.** Repository and requirements inspection used `gpt-6.2-sol` at `ultra`. Comparing a planned workflow to code was appropriate because routing, reporting and shelter coordination have intersecting data requirements. [D1/D3](MODEL_DECISION_LOG.md)
- **Result and human decision.** The participant selected HydroGrid and later asked for real public context. The exercise boundaries and bounded geography let judges rehearse transitions involving several roles, offline capture and limited resources. A separate view handles sourced streets and weather plus private tests. [Initial scope](https://github.com/Manu577228/HydroGrid/blob/8214ee577bec0b8b5e1c247532d055749d398d08/AGENTS.md) · [Sourced geography commit](https://github.com/Manu577228/HydroGrid/commit/9fc76a0f84045d2ec656ac3801b9384fc2de96c3)
- **Verification, limits and lesson.** The checked-in [walkthrough](../demo.md) and [operations guide](../operations.md) document the resulting boundaries. Stakeholder roles come from the brief and the software. Field research and adoption by emergency agencies remain outside the evidence. Provenance and permission scope belong in the product itself.

## Plan

- **Objective and inputs.** Fit the agreed lifecycle in one modular Spring application, same-origin React UI and PostGIS store. Compare the original brief's multi-service architecture, Redis, full pgRouting and AI triage alternatives against a bounded Dijkstra graph, deterministic rules and durable database operations. Use one scenario stream for both dispatch policies. [P1](#recorded-prompt-excerpts) · [P2](#recorded-prompt-excerpts) · [P4](#recorded-prompt-excerpts)
- **Codex and configuration.** The root used `gpt-6.2-sol` at `ultra` to plan the data model, role-specific API, idempotency and acceptance checks. It separated the deterministic engine, spatial/API contracts and browser so parallel teams could work against testable boundaries. [D1/D2/D4](MODEL_DECISION_LOG.md)
- **Result and human decision.** The participant retained the original architecture in the redesign and prioritized same-origin access, simulated vs sourced data, deterministic triage, transactional capacity, scoped live events, and release compatibility. Milestones moved from the core rescue workflow to replay/security and UI polish. [Design notes](../engineering.md) · [Compose](../../compose.yaml) · [routing design commit](https://github.com/Manu577228/HydroGrid/commit/8c5323abe1261cd152f90cee6a0c03940980d6d8)
- **Verification, limits and lesson.** [Integration cases](../../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java) and [acceptance journeys](../../e2e/tests) connect design decisions to executable outcomes. The proof is a bounded exercise environment. Define how each uncertain action will be tested before expanding the product surface.

## Build

- **Objective and inputs.** Build the browser flows, spatial API, deterministic engines and additive data model, then evolve the exercise dashboard, account sessions and scoped event flow. [P2](#recorded-prompt-excerpts) · [P4](#recorded-prompt-excerpts) · [P5](#recorded-prompt-excerpts)
- **Codex and configuration.** Scoped engine, backend and frontend subagents worked in parallel. Accounts, dashboard and shell formed a second split for 2.0. Root and each listed subagent inherited `gpt-6.2-sol` at `ultra`. Separation helped identify explicit integration contracts and reduce concurrent edits to the same files. [D2/D4](MODEL_DECISION_LOG.md) · [Capability matrix](CAPABILITY_MATRIX.md)
- **Result and human decision.** Implemented IndexedDB replay with durable operation identity, scope-specific STOMP, route/incident/mission workflows, row-locked shelter updates, independent citizen sessions and a workspace owner proof. The participant required persistent public demo access and preserved the Exercise, Live Bengaluru and private operator boundaries. [PostGIS API](https://github.com/Manu577228/HydroGrid/commit/093ab9b255a686e6eb4763c00121cbec370023bb) · [PWA](https://github.com/Manu577228/HydroGrid/commit/1b22225305cbdf5493e3913eabc4767bfe7dc310) · [workspace owner proof](https://github.com/Manu577228/HydroGrid/commit/fbf57f792f3ca88a8cea9e2178fba77a2b6214ea) · [2.0 PR](https://github.com/Manu577228/HydroGrid/pull/1)
- **Verification, limits and lesson.** Follow code from [migrations](../../backend/src/main/resources/db/migration), [server source](../../backend/src/main/java/com/hydrogrid) and [frontend source](../../frontend/src) through [release CI](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328). Email recovery and external agencies remain scoped separately. Shared integration checks matter where independently built features meet.

## Test

- **Objective and inputs.** Exercise routing and simulation with fixed inputs, PostGIS authorization and races, real-browser reconnect and reload, responsive interaction and accessibility, and repeatable benchmarks. [P2](#recorded-prompt-excerpts) · [P4](#recorded-prompt-excerpts)
- **Codex and configuration.** The root used `gpt-6.2-sol` at `ultra` to drive Maven, Playwright and Docker. A live PostGIS process checked locks and spatial behavior. Chromium reproduced offline queue recovery and WebSocket delivery. [D2/D4/D5](MODEL_DECISION_LOG.md)
- **Result and human decision.** Release verification recorded 24 passing Maven tests, 17 local Playwright passes including three fixture-only cases, 14 hosted Playwright passes and 120 automated axe/layout scans with zero reported axe violations, horizontal overflows or page errors. The participant required baseline checks before changing 2.0 and preservation of the existing deployment. [Test source](../../backend/src/test/java/com/hydrogrid) · [Browser source](../../e2e/tests) · [Release verification](../release-2.0.md#verification)
- **Verification, limits and lesson.** The [CI run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) verifies the deployed source revision. A startup probe missed connection resets and a hosted transition revealed a keyboard timing issue. [Review](#review) links both corrections. Local fixtures and public smoke tests have separate permissions. The final audit adds a reproducible [accessibility command](../../e2e/accessibility.mjs) and a [nine-run study](../benchmarks.md) across three seeds and three workloads. It records critical coverage, overall service, p95 and assignment validity together.

## Review

- **Objective and inputs.** Examine workspace authorization, source claims, atomic writes, offline synchronization, routes, layout, and the deployment boundary. The final brief requested an independent pass and evidence for every correction. [P5](#recorded-prompt-excerpts) · [P6](#recorded-prompt-excerpts)
- **Codex and configuration.** A separate Codex workstream examined source, design and verification artifacts, and the root integrated findings. Reviewers inherited `gpt-6.2-sol` at `ultra`. A focused workstream helped challenge assumptions about cross-scope reachability and evidence validity. [D4/D5/D6](MODEL_DECISION_LOG.md)
- **Result and human decision.** The review record distinguishes actual defects, corrections and known coverage limits. The participant authorized the prior live release and retained a separate approval gate for final publication. [Findings with status](REVIEW_FINDINGS.md) · [Keyboard correction](https://github.com/Manu577228/HydroGrid/pull/2)
- **Verification, limits and lesson.** Verify the [owner rejection test](../../e2e/tests/api.spec.mjs), [slow-route keyboard regression](../../e2e/tests/platform.spec.mjs), [security scope](../security.md) and [release CI](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328). The review is a scoped source and application review. Put timing failures under deliberate delay and inspect authorization at the contract boundary.

## Document

- **Objective and inputs.** Give judges a short runnable route and engineers a way to verify each significant claim. Consolidate older records without rewriting development chronology. [P6](#recorded-prompt-excerpts)
- **Codex and configuration.** Codex inspected Git and historical run metadata, drafted versioned Markdown and checked references with `gpt-6.2-sol` at `ultra`. Linked evidence provides detail without overwhelming the introduction. [D6](MODEL_DECISION_LOG.md)
- **Result and human decision.** The participant requested a README, judge walkthrough, diagrammed architecture, API/setup/security/testing/deployment notes, reproducible comparisons and a prompt/decision trail. The pack replaces older lifecycle labels and keeps earlier commits as evidence. [First judging evidence](https://github.com/Manu577228/HydroGrid/commit/7dd5c064e41a7030b8167eb7dcab2f33b07d7645) · [README](../../README.md) · [Setup](../setup.md) · [API](../api.md) · [Testing](../testing.md) · [Traceability](TRACEABILITY_MATRIX.md)
- **Verification, limits and lesson.** Evidence links point to source and exact earlier PRs and CI. Original raw chats are private. The participant authorized publication to the deployment branch. The documentation can be opened from that public branch. Capture public-safe proof at each step so reviewers can verify the production claims independently.

## Ship

- **Objective and inputs.** Package a repeatable Compose build, host it on Render, use Neon PostgreSQL with PostGIS and TLS, deploy reviewed revisions and verify application readiness. [P3](#recorded-prompt-excerpts) · [P5](#recorded-prompt-excerpts)
- **Codex and configuration.** The root combined CLI health/deploy verification and GitHub repository metadata at `gpt-6.2-sol` / `ultra`. Provider-side status maps an exact revision to the hosted service. [D3/D5](MODEL_DECISION_LOG.md)
- **Result and human decision.** The participant chose Neon and authorized the prior 2.0 release. Public Render release `940edb064d90053414370addb871f6b33e997e93` passed release checks. Local Compose and additive Flyway migrations keep the release reproducible. [Render Blueprint](../../render.yaml) · [Neon cutover](https://github.com/Manu577228/HydroGrid/commit/ea9a2df98013966656fb65918270227a144e763d) · [2.0 PR](https://github.com/Manu577228/HydroGrid/pull/1) · [Fix PR](https://github.com/Manu577228/HydroGrid/pull/2)
- **Verification, limits and lesson.** [Health JSON](https://hydrogrid-demo-7v9f.onrender.com/api/health), [release pass](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328), and the [deployment record](../deployment.md) distinguish live checks, the exact released commit and rollback. Free hosting can idle. Validate readiness and public scope separately from deployment status.

The participant made a dedicated Vercel frontend mandatory and approved the rollout. Codex reconnected the existing public Vercel site to the deployed Render API, configured a direct authenticated STOMP connection, and kept Neon and the combined Render fallback in place. [Frontend](https://hydrogrid-response.vercel.app/) · [API health through Vercel](https://hydrogrid-response.vercel.app/api/health) · [Render backend health](https://hydrogrid-demo-7v9f.onrender.com/api/health) · [Deployment record](../deployment.md) · [Hosted verification](../testing.md) · [Split release CI](https://github.com/Manu577228/HydroGrid/actions/runs/45970866151)

## Automate

- **Objective and inputs.** Preserve test, packaging, readiness and reproducible replay checks across repeated changes. [P2](#recorded-prompt-excerpts) · [P3](#recorded-prompt-excerpts) · [P6](#recorded-prompt-excerpts)
- **Codex and configuration.** The root used `gpt-6.2-sol` at `ultra` to wire Maven verification and a Compose/Playwright release job, harden startup checks, and record same-seed replay automation. Repository `AGENTS.md` and project-scoped Neon skills guide future work. [D2/D3/D5/D6](MODEL_DECISION_LOG.md)
- **Result and human decision.** Push/PR CI builds and probes the service, executes browser regression coverage, and retains failure traces. The benchmark runner emits comparable results for repeated seeds. Vercel and Render are connected to the approved `submission-final-audit` release branch. The final brief limits publishing and leaves scheduled monitoring unconfigured. [CI workflow](../../.github/workflows/ci.yml) · [Probe correction](https://github.com/Manu577228/HydroGrid/commit/8df1d6a61e8f6337c480c38211baec1a0a4d00f3) · [Benchmark runner](../../deploy/benchmark.mjs) · [Persistent instructions](../../AGENTS.md)
- **Verification, limits and lesson.** The [main CI run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) shows the push-triggered checks and [benchmark results](../benchmarks.md) show both policies, including unfavorable seeds. The workflow checks application behavior and readiness. Long-running uptime and dependency monitoring require separate evidence. Bound readiness retries around the observed startup failures.

## Data and evidence limits

- P1–P6 are selected exact quotes. Source links and recorded metadata provide corroboration without exposing private records.
- Codex model selection shows one inherited configuration. The decision log separates the configuration and observed outcomes from retrospective task-fit rationale.
- Synthetic actions and benchmark times describe an exercise. Public geography, modeled weather, official bulletin data and read-only agency-feed results have their own freshness and permissions. [Operations guide](../operations.md)
- [Traceability](TRACEABILITY_MATRIX.md) tracks what the repository proves and what the participant or organizer still needs to confirm.
