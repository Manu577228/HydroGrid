# HydroGrid 2.0 architecture

The public React frontend is deployed on Vercel. Render runs the Spring Boot application, serves the combined fallback, and hosts the REST and STOMP endpoints. Neon persists the PostgreSQL and PostGIS data. The simulated response workspace and the sourced Bengaluru map are separate flows.

| View | What it explains |
| --- | --- |
| [System context and containers](system.md) | Roles, external data, the full request and event path, and the Vercel, Render and Neon boundaries. |
| [Frontend components](frontend.md) | React routing, page families, state, API clients, Workbox and IndexedDB. |
| [Backend components](backend.md) | Controller boundaries, deterministic engines, transactional stores and committed events. |
| [Data and security](data-security.md) | Flyway schema, entity relationships, scope, bearer and refresh tokens, and GPS consent. |
| [Deployment and operations](deployment.md) | Live topology, release automation, failure paths, health checks and cleanup. |

The workflow and engineering notes describe selected code-level behavior, including report retry, triage thresholds, Dijkstra routing, concurrent dispatch, shelter admission and paired policy simulation. [Engineering detail](../engineering.md) · [REST and WebSocket API](../api.md) · [Testing and verification](../testing.md) · [Release evidence](../deployment.md)

The split application was verified at [integration commit `5d08129`](https://github.com/Manu577228/HydroGrid/commit/5d08129b5e08847322d509318c9fd637c7f0c883). The diagrams describe that runtime topology and the source in the submission branch. Later documentation commits can advance the branch SHA without changing the runtime architecture.
