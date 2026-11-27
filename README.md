![HydroGrid 2.0 — Every SOS Counts](docs/assets/hydrogrid-banner.svg)

# HydroGrid — Real-Time Disaster Response and Rescue Coordination Platform

**Every SOS Counts.** Practice the path from a citizen’s offline SOS to triage, dispatch, responder updates, and shelter admission. Then replay the same flood scenario under two dispatch policies and inspect the trade-offs.

[![HydroGrid checks on the deployment branch](https://github.com/Manu577228/HydroGrid/actions/workflows/ci.yml/badge.svg?branch=submission-final-audit)](https://github.com/Manu577228/HydroGrid/actions/workflows/ci.yml?query=branch%3Asubmission-final-audit)

[Vercel frontend](https://hydrogrid-response.vercel.app/) · [Render fallback](https://hydrogrid-demo-7v9f.onrender.com/) · [90-second quick start](#experience-hydrogrid-in-90-seconds) · [Codex Evidence Pack](docs/evidence/CODEX_EVIDENCE_PACK.md) · [Architecture](docs/engineering.md) · [Benchmark results](docs/benchmarks.md)

HydroGrid is an accountable disaster-response prototype for citizens, coordinators, responders, and shelter operators. A practice report survives interrupted connectivity. A coordinator can inspect its priority, compare equipped units and open routes, then approve a dispatch. Responders and shelter operators record separate milestones, which the dashboard and audit history reflect after commit. **Rescue operations in the exercise are synthetic.** Live Bengaluru shows independently sourced geographic and environmental information. For an emergency in India, use the official 112 service. [Emergency Response Support System](https://112.gov.in/)

## Experience HydroGrid in 90 Seconds

| Time after load | Try this | Look for |
| --- | --- | --- |
| 0:00–0:20 | Open the [live demo](https://hydrogrid-response.vercel.app/) and choose **Start interactive demo**. Open **Citizen SOS**, select a map location or landmark, and send a fictional report. | The isolated practice workspace opens without registration. The SOS gets a delivery receipt. |
| 0:20–0:55 | Open **Command center**, select the new report, and inspect its priority, unit recommendation, and route. Choose a compatible report or seeded incident if a recommendation is unavailable. Review and confirm dispatch, then open **Responder console**. | Coordinator approval creates an assignment. The responder can mark departure, arrival, and completion. |
| 0:55–1:30 | Open **Shelters** to see capacity, **Analytics & audit** to see committed events, and **Simulation lab** to compare the included dispatch policies. | Reservations and admissions have separate counts. Both policies replay the same scenario inputs. |

Free hosting may need about a minute to wake before the first step. The extended walkthrough covers a real browser outage, reconnect and deduplication, an exercise flood detour, and a linked shelter check-in. Use Docker if the hosted service is unavailable. [Verified judge walkthrough](docs/demo.md) · [Two-minute demo storyboard](docs/demo-script.md) · [Local quick start](#run-the-demo)

## Product showcase

| Operations dashboard | Command center |
| --- | --- |
| ![Dark-theme exercise dashboard with seeded incident counts and severity charts](docs/screenshots/dashboard-preview.webp) | ![Command center with an incident queue, simulated flood map, and dispatch details](docs/screenshots/command.webp) |
| Time-window metrics and committed exercise activity. | Review priorities, route availability, and unit fit before dispatch. |

| Offline SOS | Dispatch simulation |
| --- | --- |
| ![Practice SOS outbox showing a saved report while the browser is offline](docs/screenshots/sos-queued.webp) | ![Simulation lab comparing FIFO and HydroGrid on a shared synthetic scenario](docs/screenshots/simulation-comparison.webp) |
| IndexedDB preserves the practice report until delivery. | Inspect coverage, elapsed response, utilization, and unserved reports. |

<img src="docs/screenshots/practice-sos-mobile.png" width="230" alt="Light-theme practice SOS on mobile with short reporting steps and a delivery status" />

[Full screenshot gallery, including light and dark themes](docs/showcase.md)

## Why this problem matters

A report can arrive late during a network outage. The team that receives it still has to assess urgency, find a vehicle with the right equipment and capacity, identify a viable route, and know whether a shelter can admit the group. Each role needs a shared view of the current state and a record of decisions. FEMA’s January 2011 incident-management guidance treats interoperable communications, resource coordination, and situational awareness as core capabilities. [FEMA Incident Management and Support Keystone](https://www.fema.gov/sites/default/files/2020-07/fema_incident_management_and_support_keystone-Jan2011.pdf)

| Publicly documented approach | What its own documentation emphasizes |
| --- | --- |
| Ushahidi | Configurable surveys and mapped submissions for crowd reporting and analysis. [Ushahidi surveys](https://docs.ushahidi.com/platform-user-manual/3.-configuring-your-deployment/3.3-surveys) |
| Sahana Eden | Humanitarian coordination across assets, requests and inventories, plus shelter check-in and check-out. [Sahana Eden archive](https://sahanafoundation.org/products/eden/) |
| HydroGrid | One repeatable flood exercise linking offline SOS, scored triage, hazard-aware dispatch, responder and shelter state, and a paired policy replay with an audit trail. [Engineering design](docs/engineering.md) · [Benchmark methodology](docs/benchmarks.md) |

The project contribution is the integration of those decisions into a small, reproducible exercise. The ranking rules, shortest-path algorithm, spatial queries, and transaction mechanisms are established techniques.

## Disaster response intelligence loop

```mermaid
flowchart LR
    A["Practice SOS<br/>Choose an exercise location"] --> B["IndexedDB outbox<br/>Retry with the same request ID"]
    B --> C["API receipt and triage"]
    C --> D["Filter eligible units<br/>Find an open route"]
    D --> E["Coordinator confirms dispatch"]
    E --> F["Responder records milestones"]
    F --> G["Shelter reserves and admits"]
    E --> H["Committed audit and dashboard"]
    F --> H
    G --> H
    I["Seeded replay of the two policies"] --> J["Compare coverage and simulated response"]
```

A browser can use a manual practice location or, with permission, use GPS to suggest a nearby fictional site. The separate private field workspace can share a real device fix with authorized participants. Simulations generate independent scenario inputs. [Data and operator boundaries](docs/operations.md)

| Capability | Implementation and verification |
| --- | --- |
| Citizen, coordination, and responder | **Implemented and verified.** Offline SOS and mission outboxes, idempotent retries, routed recommendations, confirmation, and mission transition checks. [Browser tests](e2e/tests/browser.spec.mjs) · [API tests](e2e/tests/api.spec.mjs) |
| Shelter, dashboard, and audit | **Implemented and verified.** Transactional capacity and check-in, scoped dashboard and event feeds, incident detail and exports. [Backend integration](backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java) · [Dashboard tests](e2e/tests/platform.spec.mjs) |
| Geospatial view and field test | **Implemented and verified within a bounded area.** Exercise routing excludes intersecting closures. Live Bengaluru uses a separate OSM extract, modeled weather, and sourced bulletins. Opt-in device sharing uses private field access. [Live and field tests](e2e/tests/live.spec.mjs) |
| Authentication and city operations | **Implemented and verified in isolated fixtures.** Citizen accounts, browser-owned demo roles, and separately configured agency roles. The authorized traffic feed provides sourced observations when available. [Security](docs/security.md) · [Scoped operations](docs/operations.md) |
| Policy evaluation | **Experimental.** Fixed-seed paired replay with timing and coverage distributions. [Measured study](docs/benchmarks.md) |
| Delivery | **Implemented and verified for the deployed revision.** Docker and Compose reproduce the service. GitHub Actions runs backend and release checks. Vercel serves the dedicated frontend. Render serves the API and the combined fallback with Neon PostgreSQL. [Deployment evidence](docs/deployment.md) |

## System architecture

```mermaid
flowchart LR
    subgraph Browser["Browser and PWA"]
        React["React routes, query cache and maps"]
        DB["IndexedDB outbox and snapshots"]
        SW["Service worker app shell"]
        React <--> DB
        SW --> React
    end
    subgraph Render["Same-origin Docker service on Render"]
        API["Spring Boot REST and STOMP"]
        Auth["Spring Security and scoped tokens"]
        Services["Transactions, triage, routing and replay"]
        API --> Auth --> Services
    end
    Vercel["Vercel SPA and same-origin API rewrite"]
    React <-->|"HTTPS"| Vercel
    Vercel <-->|"Proxied HTTPS API"| API
    React <-->|"Direct WSS STOMP"| API
    Services <-->|"JDBC, Flyway and spatial queries"| PG["Neon PostgreSQL 16 and PostGIS"]
    React --> Weather["Open-Meteo"]
    API --> Feeds["NDMA SACHET and scoped IUDX"]
```

- **Explainable ranking and routing.** Severity, incident factors, and waiting time produce a visible score. The engine filters by capacity, equipment, and reachability. PostGIS identifies exercise closures before the routing engine searches available roads.
- **Durable client retries.** IndexedDB outboxes keep synthetic SOS and mission actions on the device. The server reconciles client-generated IDs against scoped receipts.
- **Coordinated state changes.** Database locks and constraints protect assignments and shelter capacity. An after-commit event signals clients to refresh scoped state.

| Layer | Stack | Role |
| --- | --- | --- |
| Browser | React 19, TypeScript, Vite 7, Tailwind 4, Leaflet, Recharts, TanStack Query | Typed and responsive operational views |
| Offline and updates | Dexie, IndexedDB, Workbox, STOMP | Durable pending actions, cached shell, and event-driven refresh |
| Service and data | Java 21, Spring Boot, Spring Security, Spring Data JPA and JDBC, PostgreSQL 16, PostGIS, Flyway | Authorization, transactions, geographic queries, and repeatable migrations |
| Validation and release | Maven, Testcontainers, Playwright, Docker Compose, GitHub Actions, Vercel, Render, Neon | Reproducible tests and single-image delivery |

[Architecture, sequence diagrams, dependency versions, and trade-offs](docs/engineering.md)

## Scientific benchmark

Three workloads and three seeds gave **nine paired runs**, each with a 120-minute simulation horizon. The policies share the same incident stream, offline delays, hazards, units, and eligibility constraints.

| Pooled result across nine runs | FIFO | HydroGrid |
| --- | ---: | ---: |
| Critical reports reached by horizon | 92 / 141 | 135 / 141 |
| Reports reached / unserved | 670 / 260 | 659 / 271 |
| Median simulated response for reached reports | 24 min | 18 min |
| p95 simulated response for reached reports | 80 min | 86 min |

HydroGrid reached 43 more critical reports and 11 fewer reports overall. The mean and median fell, while the p95 increased. These are synthetic replay outcomes measured among reports reached by the cutoff. [All per-seed results, chart, and reproduction](docs/benchmarks.md) · [Machine-readable study](docs/data/dispatch-study.json)

## Security, privacy, and test evidence

Citizen accounts, exercise roles, and private field and agency access use separate authorization. The exercise has a browser-held ownership proof. Real GPS sharing is opt-in and restricted to the private field test. Local security and browser tests cover session revocation, isolation, cross-workspace events, offline replay, and competing writes. [Security review](docs/security.md) · [Independent findings](docs/evidence/REVIEW_FINDINGS.md)

The split release passed **25 backend tests**, **17 local browser/API checks**, and **15 hosted Vercel Playwright checks**. Two private write workflows passed against isolated fixtures. The Vercel frontend also passed **120** automated accessibility and layout scans. [Verification details](docs/testing.md) · [GitHub Actions on the deployment branch](https://github.com/Manu577228/HydroGrid/actions/workflows/ci.yml?query=branch%3Asubmission-final-audit)

## Run the demo

```sh
git clone https://github.com/Manu577228/HydroGrid.git
cd HydroGrid
docker compose up --build -d --wait
curl --fail http://127.0.0.1:8080/api/health
```

Open [localhost:8080](http://127.0.0.1:8080/). Use another loopback port with `HYDROGRID_PORT` and stop with `docker compose down`. Docker Compose brings up a local PostGIS database and Flyway applies migrations during startup. [Fresh setup, test commands, and troubleshooting](docs/setup.md)

| Interface | Example entry points |
| --- | --- |
| Public | `GET /api/health`, `GET /api/live/alerts` |
| Browser-owned practice | `POST /api/auth/demo`, `POST /api/incidents`, `GET /api/dashboard`, `POST /api/simulation` |
| Account and field | Scoped account, field, and operations endpoints with separate credentials |
| Realtime | `/ws` with an authorized STOMP connection and subscription |

[API reference and synthetic examples](docs/api.md) · [Vercel, Render, Neon, and rollback](docs/deployment.md) · [Direct backend health](https://hydrogrid-demo-7v9f.onrender.com/api/health) · [2.0 release notes](docs/release-2.0.md)

## Built with Codex — Competition Evidence

**The 1-Month Build Challenge — Build with Codex.** The Evidence Pack records the request, engineering decisions, implementation, and verification for **Understand → Plan → Build → Test → Review → Document → Ship → Automate**. It distinguishes terminal and browser work, parallel Codex agents, repository instructions, Neon skills and MCP configuration, and external delivery services. Local session metadata shows `gpt-6.2-sol` with `ultra` for the recorded root turns and inherited subagent settings. It documents the absence of measured model switching or comparative reasoning runs. [Evidence Pack](docs/evidence/CODEX_EVIDENCE_PACK.md) · [Capability matrix](docs/evidence/CAPABILITY_MATRIX.md) · [Model decision log](docs/evidence/MODEL_DECISION_LOG.md)

| Judging criterion | Evidence |
| --- | --- |
| Lifecycle Coverage and Depth · 30 | [Eight stages and their artifacts](docs/evidence/CODEX_EVIDENCE_PACK.md) |
| Codex Capability Use and Fit · 25 | [Recorded usage and oversight](docs/evidence/CAPABILITY_MATRIX.md) · [Persistent AGENTS.md](AGENTS.md) |
| Model and Reasoning Discipline · 20 | [Verified settings and limitations](docs/evidence/MODEL_DECISION_LOG.md) |
| Working Result and Engineering Craft · 15 | [Test report](docs/testing.md) · [Release PR](https://github.com/Manu577228/HydroGrid/pull/1) · [Regression PR](https://github.com/Manu577228/HydroGrid/pull/2) · [Workflow](.github/workflows/ci.yml) |
| Problem Worth Solving and Originality · 10 | [Judge walkthrough](docs/demo.md) · [Paired dispatch study](docs/benchmarks.md) |

[Full traceability matrix](docs/evidence/TRACEABILITY_MATRIX.md) · [Commit history](https://github.com/Manu577228/HydroGrid/commits/main/) · [Submission checklist](docs/submission-checklist.md)

## Repository map

| Path | Contents |
| --- | --- |
| [frontend](frontend/) | React routes, maps, IndexedDB, application styling |
| [backend](backend/) | API, authorization, spatial engine, migrations and integration tests |
| [e2e](e2e/) and [deploy](deploy/) | Browser and API regression suites, benchmark runner and startup |
| [docs](docs/) and [docs/evidence](docs/evidence/) | Engineering, setup, data sources, verification and judging evidence |

## Limitations and responsible use

- HydroGrid is a practice tool. Use official emergency services for actual incidents. Dispatch, flood depth, closure polygons, and the exercise shelter register are synthetic.
- The sourced map covers a bounded part of central Bengaluru. Modeled weather and published bulletins have independent update cadences. The authenticated traffic source can return no recent reports. Use the issuing authorities for live safety decisions.
- Citizen accounts lack email verification and password recovery. Private operator enrollment requires local administrator configuration. Free hosting can sleep. The benchmark and isolated load checks establish prototype behavior.
- Production extension would require authorized event feeds and operators, verified identity recovery and retention policies, and field validation with an agency. [Security and residual risks](docs/security.md) · [Data attribution and roadmap](docs/attribution.md)

OpenStreetMap contributors supply the bounded street extract under ODbL. Open-Meteo, NDMA SACHET, and Bengaluru Traffic Police via IUDX are separately attributed. The landing artwork is an illustration. The repository currently has no project-wide license file. Its public visibility gives judges source access. [Attribution and license status](docs/attribution.md)

[Live HydroGrid](https://hydrogrid-response.vercel.app/) · [Render fallback](https://hydrogrid-demo-7v9f.onrender.com/) · [Public repository](https://github.com/Manu577228/HydroGrid) · [Codex Evidence Pack](docs/evidence/CODEX_EVIDENCE_PACK.md) · [Final checklist](docs/submission-checklist.md)
