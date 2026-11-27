# Diagram catalog

The README contains five overview diagrams. The supporting views show the system, database, security, deployment and engineering workflows in greater detail. All diagrams below were rendered as SVG in Chromium with Mermaid 11.17.2. The standalone SVGs use the same definitions as the two corresponding README diagrams.

[System architecture SVG](assets/hydrogrid-system-architecture.svg) · [Eight-stage lifecycle SVG](assets/hydrogrid-lifecycle.svg) · [Documentation index](README.md)

## README diagrams

- Disaster response intelligence loop (Flowchart)
- Offline SOS synchronization (Sequence)
- System architecture (Flowchart)
- Simulation and policy comparison (Flowchart)
- Complete Software Development Lifecycle — Built with Codex (Flowchart)

## Supporting diagrams

| Document | Contents |
| --- | --- |
| [Backend components](architecture/backend.md) | Level 3 · Spring Boot application (Flowchart) |
| [Data and security architecture](architecture/data-security.md) | Exercise entity relationships (ER) · Account and operator entity relationships (ER) · Trust boundaries (Flowchart) |
| [Deployment and operations architecture](architecture/deployment.md) | Production infrastructure (Flowchart) · CI and release workflow (Flowchart) · Environment topology (Flowchart) · Migration and readiness workflow (Sequence) · Recovery and rollback workflow (Flowchart) |
| [Frontend components](architecture/frontend.md) | Level 3 · Browser application (Flowchart) |
| [System context and containers](architecture/system.md) | Level 1 · System context (Flowchart) · Level 2 · Master system architecture (Flowchart) |
| [HydroGrid architecture and engineering](engineering.md) | HydroGrid architecture and engineering (Flowchart) · Matching and routing (Sequence) · Offline and real-time reconciliation (Sequence) |
| [HydroGrid 2.0 Codex evidence pack](evidence/CODEX_EVIDENCE_PACK.md) | Lifecycle records (Flowchart) |
| [Lifecycle · Understand](evidence/lifecycle/01-understand.md) | Problem decomposition (Flowchart) · Stakeholder interaction and system context (Flowchart) · Requirements and success criteria (Flowchart) |
| [Lifecycle · Plan](evidence/lifecycle/02-plan.md) | Dependency decisions (Flowchart) |
| [Lifecycle · Build](evidence/lifecycle/03-build.md) | Components and data ownership (Flowchart) |
| [Lifecycle · Test](evidence/lifecycle/04-test.md) | Testing pyramid (Flowchart) · Offline SOS test sequence (Sequence) · Dispatch and shelter contention test sequence (Sequence) · Failure-mode sequences · flowchart 1 (Flowchart) |
| [Lifecycle · Review](evidence/lifecycle/05-review.md) | Review and correction loop (Flowchart) |
| [Lifecycle · Document](evidence/lifecycle/06-document.md) | Documentation map (Flowchart) |
| [Lifecycle · Ship](evidence/lifecycle/07-ship.md) | Hosted verification sequence (Sequence) |
| [Lifecycle · Automate](evidence/lifecycle/08-automate.md) | Engineering lifecycle automation (Flowchart) · Runtime automation (Flowchart) · Improvement and acceptance (Flowchart) |
| [Shelter and dashboard coordination](workflows/coordination.md) | Shelter coordination (Sequence) · Real-time dashboard updates (Sequence) |
| [Authentication lifecycles](workflows/identity.md) | Registration (Sequence) · Login (Sequence) · Session restoration (Sequence) · Refresh-token rotation (Sequence) · Logout (Sequence) · Demo workspace access (Sequence) · Private field workspace access (Sequence) |
| [Live information and GPS](workflows/live-data.md) | Public streets and weather (Flowchart) · Official bulletins (Flowchart) · Configured traffic data (Sequence) · Device permission and private sharing (Sequence) |
| [Reporting and offline synchronization](workflows/reporting.md) | Citizen SOS lifecycle (Sequence) · Offline synchronization (Sequence) |
| [Triage, routing and rescue response](workflows/response.md) | Incident lifecycle (State) · Triage and prioritization (Flowchart) · Flood-aware routing algorithm (Flowchart) · Synthetic blocked-road detour (Flowchart) · Rescue resource matching (Flowchart) · Transactional dispatch (Sequence) · Responder mission states (State) · Responder milestone replay sequence (Sequence) |
| [Simulation engine lifecycle](workflows/simulation.md) | Simulation engine lifecycle (Flowchart) |

The Mermaid views cover implemented practice workflows and the verified host topology. The gallery contains actual product screenshots. The dispatch chart shows measured synthetic comparisons. [Product gallery](showcase.md) · [Benchmark chart](benchmarks.md)
