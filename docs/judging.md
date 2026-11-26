# HydroGrid judging evidence

HydroGrid is a flood-response exercise on a synthetic map near Bengaluru. It puts the offline report, route decision, unit dispatch, shelter admission, and audit trail in the same browser workspace. Live Bengaluru adds sourced streets, current weather estimates, government bulletins, and a private device test. [Open the live demo](https://hydrogrid-demo-7v9f.onrender.com/) · [Follow the four-minute walkthrough](demo.md)

## Lifecycle coverage and depth · 30

| Stage | Decision or result | Evidence |
| --- | --- | --- |
| Discover | Identify what breaks when a flood blocks roads and reports arrive late. Track whether a report reaches the command center and whether a suitable unit can reach it. | [Problem and originality](#problem-worth-solving-and-originality--10), [initial scope and constraints](https://github.com/Manu577228/HydroGrid/blob/8214ee577bec0b8b5e1c247532d055749d398d08/AGENTS.md) |
| Define | Use fictional incidents, an isolated workspace for each browser, and role-specific pages for the decisions in the exercise. A live view uses sourced geography and opt-in device GPS. | [Page and task map](../README.md#walkthrough), [exercise walkthrough](demo.md) |
| Design | Put the app and API on one origin. Queue offline writes with stable client IDs, use PostGIS to exclude flooded roads, and lock the affected rows during dispatch and admissions. | [Architecture and decision notes](engineering.md), [routing and replay design](https://github.com/Manu577228/HydroGrid/commit/8c5323abe1261cd152f90cee6a0c03940980d6d8) |
| Build | Implement the simulation engine, spatial operations, role-scoped API, and offline-first browser workspace. Redesign the workspace around clear actions and status. | [Simulation engine](https://github.com/Manu577228/HydroGrid/commit/8c5323abe1261cd152f90cee6a0c03940980d6d8), [backend](https://github.com/Manu577228/HydroGrid/commit/093ab9b255a686e6eb4763c00121cbec370023bb), [frontend](https://github.com/Manu577228/HydroGrid/commit/1b22225305cbdf5493e3913eabc4767bfe7dc310), [redesign](https://github.com/Manu577228/HydroGrid/commit/dbd75625263bb1d5e0bfb37417b3e0ebbedf426a) |
| Test | Exercise algorithms in Java, transactions against PostGIS, and user flows with Playwright. | [Backend tests](../backend/src/test/java/com/hydrogrid), [end-to-end tests](../e2e/tests), [verified release CI run](https://github.com/Manu577228/HydroGrid/actions/runs/45880494565) |
| Review | Verify workspace isolation, duplicate suppression, dispatch races, and shelter capacity. Retry transient connection resets during release verification. | [PostGIS integration cases](../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java), [startup probe fix](https://github.com/Manu577228/HydroGrid/commit/8df1d6a61e8f6337c480c38211baec1a0a4d00f3) |
| Release | Build the application with Docker Compose and publish it on Render with Neon PostgreSQL and an encrypted database connection. | [Compose](../compose.yaml), [Render Blueprint](../render.yaml), [Neon cutover](https://github.com/Manu577228/HydroGrid/commit/ea9a2df98013966656fb65918270227a144e763d) |
| Evaluate | Reproduce three scenario seeds, compare both policies on identical inputs, and inspect service rates alongside response time. | [Measured results](benchmarks.md), [benchmark runner](../deploy/benchmark.mjs), [benchmark evidence commit](https://github.com/Manu577228/HydroGrid/commit/97d6013adba76a2542730a30e29e5d4f874d6de7) |

## Codex capability use and fit · 25

| Capability | Task and reason for using it |
| --- | --- |
| Repository editing and delegation | Scoped separate agents to the React workspace, Spring/PostGIS API, and Java dispatch engine so independent work could proceed in parallel. The integration pass checked their contracts together. [Frontend](https://github.com/Manu577228/HydroGrid/commit/1b22225305cbdf5493e3913eabc4767bfe7dc310) · [Backend](https://github.com/Manu577228/HydroGrid/commit/093ab9b255a686e6eb4763c00121cbec370023bb) · [Engine](https://github.com/Manu577228/HydroGrid/commit/8c5323abe1261cd152f90cee6a0c03940980d6d8) |
| Terminal, containers, and browser tests | Used Maven and PostGIS for algorithm and concurrency checks, then used Playwright to interrupt network access and reload the app. A real database exercises dispatch locks and spatial functions. A real browser exercises the service worker and IndexedDB. [Test implementation](https://github.com/Manu577228/HydroGrid/commit/64b7d16ba3e392f80990eef7d9e810278106a79d) |
| Debugging and automation | Found that the CI readiness probe missed connection resets while the app booted. Changed the probe to retry transient failures and reran the release checks. [Fix](https://github.com/Manu577228/HydroGrid/commit/8df1d6a61e8f6337c480c38211baec1a0a4d00f3) · [CI workflow](../.github/workflows/ci.yml) |
| Deployment and verification | Used authorized provider tooling to validate the Render Blueprint, test the database change on an isolated Neon branch, and verify the live app after cutover. Configured project-scoped Neon MCP tooling separately for first-use OAuth. [Deployment commit](https://github.com/Manu577228/HydroGrid/commit/ea9a2df98013966656fb65918270227a144e763d) · [Project tooling commit](https://github.com/Manu577228/HydroGrid/commit/95de5d1b684cdecf03fdcecff5c0ad46d49d1bc4) |

### Original landing artwork

Codex used built-in ImageGen to create an original aerial scene for the fictional exercise. The brief reserved quiet space for accessible headline text rendered by the app. The optimized WebP is 166 KiB and is precached with the app shell by Workbox. [Image asset](../frontend/public/hydrogrid-aerial.webp) · [Cache configuration](../frontend/vite.config.ts)

<details>
<summary>Exact ImageGen prompt</summary>

> Use case: photorealistic-natural. Asset type: panoramic hero photograph for HydroGrid, a fictional flood response coordination dashboard. Create an original realistic oblique drone photograph of a rain-swollen canal winding through a contemporary Bengaluru-inspired neighborhood at blue hour. Deep ink-blue clouds, cool teal reflections, realistic wet concrete buildings, tree-lined roads, and restrained warm window lights. A single road bridge guides the eye from the center to an intricate, illuminated neighborhood on the right. Give the left half dark quiet negative space and let the composition fade naturally into deep navy at the left edge for white interface text. Wide landscape framing for a website banner, editorial realism, cinematic but restrained, crisp architectural textures on the right and visible depth in the water. No people in danger, no rescue spectacle, no text, logos, icons, graphics, maps, UI, or watermarks.

</details>

## Model and reasoning-effort discipline · 20

The HydroGrid Codex session records show **`gpt-6.2-sol`** with **`ultra`** reasoning effort. The frontend, backend, and engine subagents inherited that session configuration.

The effort fit the decisions where failures cross layers. Routing had to agree with the spatial closure query. Concurrent dispatch and shelter writes needed invariant checks. Offline replay had to survive a reload and produce exactly one server action, then live updates had to reach the right workspace. We split those concerns into focused tasks with independent verification. Frontend iteration concentrated on clear controls and visual checks. Runtime triage and comparison use deterministic code so identical inputs can be replayed and audited. [Engineering notes](engineering.md)

## Working result and engineering craft · 15

The Neon-backed baseline, commit `ea9a2df`, passed 14 Java tests and eight Playwright checks. Those eight checks also passed against the hosted baseline. [Baseline CI run](https://github.com/Manu577228/HydroGrid/actions/runs/45880494565)

The redesigned Docker build passed **nine Playwright checks**, including offline responder replay. Automated axe-core 4.14.1 checks across all seven pages at 390 px and 1440 px reported zero violations in 14 checks. The same viewport review found zero horizontal overflows and zero page errors. The generated Workbox service worker includes the aerial WebP in its precache. [Tested redesign commit](https://github.com/Manu577228/HydroGrid/commit/dbd75625263bb1d5e0bfb37417b3e0ebbedf426a) · [Browser cases](../e2e/tests/browser.spec.mjs) · [Cache configuration](../frontend/vite.config.ts)

| Proof | Expected evidence |
| --- | --- |
| Sourced Bengaluru view | Compare routes between seven nearby landmarks on OpenStreetMap geometry, verify the official Karnataka bulletin source, and share a test location between two authorized devices. [Data scope](../README.md#live-bengaluru) · [Browser tests](../e2e/tests/live.spec.mjs) · [Alert feed tests](../backend/src/test/java/com/hydrogrid/api/AlertFeedTest.java) |
| Offline durability | Playwright disconnects Chromium and reloads the previously opened app. After reconnecting, one queued SOS creates one incident, and two queued responder milestones appear once each in the incident timeline. [Browser tests](../e2e/tests/browser.spec.mjs) |
| Dispatch and shelter contention | Two concurrent requests targeting the same unit yield one assignment. Concurrent shelter reservations protect capacity. [PostGIS integration tests](../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java) |
| Flood-aware routing | At 40% flood intensity the direct Market Cross–Canal Bridge road closes. The route uses two alternate segments. [Routing engine tests](../backend/src/test/java/com/hydrogrid/engine/HydroEngineTest.java) · [Deployed API test](../e2e/tests/api.spec.mjs) |
| Reproducible comparisons | Repeating a seed reproduces the incident arrivals and both replay outcomes. Service rate, response time, and fleet utilization use the same scenario horizon. [Replay tests](../backend/src/test/java/com/hydrogrid/engine/DispatchSimulationTest.java) · [Benchmark results](benchmarks.md) |

## Problem worth solving and originality · 10

Flood response combines late information with roads that can become inaccessible and units with different equipment and capacity. HydroGrid lets reviewers reproduce those conditions and measure how response decisions change. A single exercise connects the queued SOS, rerouted unit, and matched shelter to an audit trail and a controlled dispatch comparison. [Reviewer walkthrough](demo.md)

Seed `1337` is the clearest tradeoff. HydroGrid serves 14 of 14 critical incidents versus FIFO's 13 of 14. Average response for served reports rises from 33.72 to 34.16 simulated minutes. Seed `7` also matters. HydroGrid's mean response is quicker while four more reports go unserved. These results make the choice of metric visible to reviewers. [Full results and replay instructions](benchmarks.md)
