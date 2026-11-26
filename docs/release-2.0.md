# HydroGrid 2.0 release notes and evidence

HydroGrid pairs an authentic, isolated disaster response exercise with sourced public conditions and private test workspaces. Open the [live landing page](https://hydrogrid-demo-7v9f.onrender.com/), choose **Start interactive demo**, and follow the [four-minute walkthrough](demo.md). No signup is needed for a practice SOS.

## Lifecycle

| Stage | Work and evidence |
| --- | --- |
| Discover | Read the supplied 2.0 brief against release `920716d`. Inventory the existing Flyway migrations, scope-specific JWTs, IndexedDB outbox, PostGIS routing, dispatch transactions, STOMP channel, and the traffic source. |
| Define | Prioritize the dashboard, shell, secure citizen identity, command workflow, and mobile practice SOS. Keep the existing stack, demo access, and the public release available during development. |
| Design | Model four access boundaries: public information, anonymous browser-owned exercise, citizen account, and the existing private field and agency workspaces. Use a restrained information-dense design, semantic theme tokens and visible data provenance. |
| Build | Split account auth, dashboard aggregation and navigation into independent workstreams. Integrate each through the existing React Router and same-origin Spring API. |
| Test | Compare the untouched baseline with the new Compose build. Use PostGIS integration tests for atomic state changes and Playwright for browser workflows, IndexedDB replay and real STOMP updates. |
| Review | Check session identifier ownership, token boundaries, role scopes, stale views, visual overflow, and accessibility in both themes. Review the keyboard path and source labels. |
| Release | Commit on `hydrogrid-2-final`, run GitHub Actions on a pull request, then deploy the reviewed merge through the existing Render and Neon setup. |
| Evaluate | Use the same seeded scenario for both dispatch policies. Record actual timing and browser verification from the release build. [Benchmark methodology](benchmarks.md) |

The release brief asked for a map-first command center, honest metrics sourced from application records, and a complete working P0 before breadth. Delegated work was split by component and API ownership. No subagent model or reasoning overrides were supplied in this pass. The earlier run's recorded model and reasoning settings are preserved in [Judging evidence](judging.md#model-and-reasoning-effort-discipline--20). The app uses deterministic code for triage, routing, and dispatch.

## Changes by area

| Area | Main files and behavior |
| --- | --- |
| Public and workspace interface | [Shell.tsx](../frontend/src/components/Shell.tsx), [Overview.tsx](../frontend/src/pages/Overview.tsx), [platform.css](../frontend/src/platform.css). Dedicated landing, grouped exercise navigation, mobile drawer, persistent theme, keyboard search, command focus and notifications. |
| Operational intelligence | [DashboardController.java](../backend/src/main/java/com/hydrogrid/api/DashboardController.java), [Dashboard.tsx](../frontend/src/pages/Dashboard.tsx), [Incidents.tsx](../frontend/src/pages/Incidents.tsx), [Resources.tsx](../frontend/src/pages/Resources.tsx), [Analytics.tsx](../frontend/src/pages/Analytics.tsx). KPI aggregation, charts with drill-down, paginated incident queries, audit and export. |
| Citizen account | [AccountController.java](../backend/src/main/java/com/hydrogrid/api/AccountController.java), [AccountStore.java](../backend/src/main/java/com/hydrogrid/api/AccountStore.java), [Account.tsx](../frontend/src/pages/Account.tsx). Registration creates a citizen only. BCrypt protects the password. A 10-minute access token remains in browser memory. The server stores a digest of a rotating refresh token and checks session revocation. The refresh cookie uses HTTP-only, Strict SameSite and Secure on HTTPS. Cookie mutations require same-origin JSON. |
| Exercise scoping and synchronization | [DemoController.java](../backend/src/main/java/com/hydrogrid/api/DemoController.java), [SessionStore.java](../backend/src/main/java/com/hydrogrid/store/SessionStore.java), [WebSocketConfiguration.java](../backend/src/main/java/com/hydrogrid/config/WebSocketConfiguration.java), [api.ts](../frontend/src/api.ts), [offline.ts](../frontend/src/offline.ts). A browser proves ownership with a 256-bit secret whose digest is stored by the server. STOMP uses one owned workspace subscription, reconnect backoff and event IDs. Failed sockets fall back to polling. |
| Practice workflows | [Sos.tsx](../frontend/src/pages/Sos.tsx), [Command.tsx](../frontend/src/pages/Command.tsx), [Responder.tsx](../frontend/src/pages/Responder.tsx), [Shelter.tsx](../frontend/src/pages/Shelter.tsx), [Simulation.tsx](../frontend/src/pages/Simulation.tsx). Mobile practice reporting, on-device location selection and notes, explicit acknowledgement, dispatch confirmation, mission retries, searchable shelter capacity and persisted simulated benchmark results. |

## API and database

- `POST /api/account/register`, `/api/account/login`, `/api/account/refresh` and `/api/account/logout` manage citizen identity and sessions. `GET` and `PATCH /api/account/profile` require a valid, revocable citizen access token.
- `GET /api/dashboard`, `/api/dashboard/incidents` and `/api/dashboard/incidents/{id}` require a coordinator token bound to its exercise. Day and hour displays use Bengaluru time. Reported headcounts sum incident reports, which may overlap. Response durations require the corresponding committed audit timestamps. Reservations, admissions and free places are shown separately.
- `POST /api/auth/demo` requires `X-Demo-Session` and `X-Demo-Owner`. Client secrets are never sent to the public dashboard or to other scopes. The public base graph and benchmarks use the original synthetic geography.
- Flyway [V4](../backend/src/main/resources/db/migration/V4__citizen_accounts.sql) adds account and session tables. [V5](../backend/src/main/resources/db/migration/V5__bind_demo_workspace_owner.sql) adds the exercise owner digest. Existing schema versions remain in place.

Older browser workspaces had no proof of ownership. On first visit to 2.0, that browser opens a new exercise. Previous local SOS copies remain in the outbox. A user can explicitly send a retained pending copy into the new exercise. Prior mission actions remain visible on the device with an explanation that their old assignments cannot be resumed. Citizen sign-out keeps the exercise and its outbox intact.

## Local execution and rollback

Run the release in an isolated Docker project when the existing development ports are in use.

```sh
HYDROGRID_PORT=8088 docker compose -p hydrogrid-2-qa -f compose.yaml up -d --build --wait
(cd backend && mvn -B -ntp verify)
(cd frontend && npm ci && npm run build)
(cd e2e && npm ci && HYDROGRID_BASE_URL=http://127.0.0.1:8088 npm test)
```

For Java and Vite development the API target defaults to port 8081 and the host database to 5433. When port 5433 is free, `compose.development.yaml` adds the loopback database port to a separately named Compose project. The existing port 8080 deployment and tunnel use their original configuration.

Release the reviewed pull request to `main`, then confirm that Render serves the merge commit and that `/api/health` is up. Preserve the existing Neon environment and all private scope settings. In a release incident prefer a forward fix that keeps workspace ownership enforced. Render can restore a previous build artifact in its Deploys page. A rollback can restore earlier environment values and application behavior while Neon retains the additive schema and records. Check the rollback against an isolated database and retest the public health endpoint before relying on it. [Render rollback documentation](https://render.com/docs/rollbacks)

## Verification

| Check | Baseline | 2.0 release candidate |
| --- | ---: | ---: |
| Maven and PostGIS | 22 passing | 24 passing |
| Browser and API | 11 passing against the published baseline | 17 passing against isolated Docker |
| Accessibility and layout | Before images captured at 390 and 1440 px | 120 automated scans across 1920, 1440, 1024, 768, 390 and 360 px, in light and dark themes. No axe violations, horizontal overflow or page errors in this matrix. |

A final browser pass caught a dashboard query formatting bug and contrast and label issues. The query now binds its time bucket origin as a SQL parameter, aligns hour buckets to Bengaluru, and has a PostGIS regression test. The accessible control names and heatmap colors were checked again after corrections.

Measured on warm local Docker services with three fresh 1440 px Chromium contexts per view and service workers disabled. Median time from navigation start to the first visible page heading, review action, or dashboard KPI was 94 ms for the baseline landing, 63 ms for the 2.0 landing, 875 ms for the baseline command center, 873 ms for the 2.0 command center, and 881 ms for the new dashboard. These are local readiness measurements. The production build reported 157.14 kB gzip for its main JavaScript chunk and 17.37 kB gzip for the lazy dashboard chunk.

The three [benchmark scenarios](benchmarks.md) were rerun on 2.0. Seed 1337 still served 14 of 14 critical incidents under HydroGrid and 13 of 14 under FIFO, with average simulated response times of 34.16 and 33.72 minutes respectively. Seed 7 still left four more incidents unserved under HydroGrid.

## Scope and known limitations

Bengaluru is the supported geography. The public exercise uses fictional incidents and resources, and the sourced Live Bengaluru page labels data and timestamps. Real telemetry, road clearance, agency staffing, and emergency dispatch need approval and fresh inputs from the relevant agencies. Use the official 112 channel in India for emergencies. [Agency onboarding and IUDX recency](operations.md)

Citizen registration is available. Organization administration and privileged invitations are deferred. Email verification and password recovery require a verified mail service. Privileged agency accounts continue to use the independently managed private workspace. A note typed for the practice SOS remains on that device. If browser storage or permissions are unavailable, use the exercise location selector and check the delivery log.

Use the test results and commit history attached to the release pull request to identify the exact deployed revision. Screenshots compare the published `920716d` baseline with the final 2.0 build.
