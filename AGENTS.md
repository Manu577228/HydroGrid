# Working on HydroGrid

HydroGrid includes a synthetic disaster response exercise and a sourced Bengaluru view. Keep simulated response recommendations distinct from public street, weather and bulletin data. Device locations and test SOS reports require private field access. Agency operations require an independently enrolled operator. Attribute and timestamp observations and keep handoff references private.

## Layout and commands

| Path | Responsibility |
| --- | --- |
| `frontend/` | React and TypeScript with Vite, Tailwind, TanStack Query and Leaflet. Dexie backs the IndexedDB outbox and Workbox caches the application shell. |
| `backend/` | Java 21 Spring Boot, Spring Security, JDBC/JPA, deterministic engines, REST and STOMP. Flyway manages PostgreSQL/PostGIS migrations. |
| `e2e/`, `deploy/`, `.github/workflows/` | Playwright, benchmark and release scripts, container configuration and CI. |
| `docs/` | Setup, architecture, API, testing, operations and competition evidence. |

Run commands from the repository root unless noted.

```sh
docker compose up -d --build --wait
curl --fail --retry 25 --retry-delay 2 --retry-all-errors http://127.0.0.1:8080/api/health
(cd backend && mvn -B -ntp verify)
(cd frontend && npm ci && npm run build)
(cd e2e && npm ci && npx playwright install chromium && npm test)
```

Use a different Compose project and `HYDROGRID_PORT` when another app instance is running. Set `HYDROGRID_BASE_URL` for Playwright when targeting that port. See [setup](docs/setup.md) and [testing](docs/testing.md) for prerequisite versions and local-only private fixtures.

## Engineering boundaries

- Keep browser REST on the same origin. Vercel rewrites `/api` to Render and uses the exact configured Render WSS endpoint. The combined deployment serves `/api` and `/ws` directly. Preserve hash-based routes. Prefer the existing types, query utilities, transactions and routing helpers when extending flows.
- Enforce role and workspace scope in the backend before reading, writing, or publishing. Anonymous exercise, citizen identity, private field access, and agency operations have distinct credentials and data. Keep provider keys, account secrets, private GPS, and operator references out of Git, logs, screenshots and public fixtures.
- Give offline writes stable client operation IDs through retries and reload. Keep pending work until a receipt confirms success. Preserve historical outbox rows on workspace changes. Treat IndexedDB and the service worker as device-local storage.
- Apply dispatch, mission and shelter invariants under transaction and affected-row locks. Publish scoped events after commit. Preserve released Flyway files and add a new version for schema changes.
- Keep triage and routing deterministic. Run dispatch comparisons against the same seed and report denominators, unserved incidents, unfavorable results and measurement scope. Keep the exercise synthetic and public source labels accurate.
- Use focused edits and review the code through its normal entries. Check error, retry, reconnect, isolation and concurrency cases when a change affects them. Keep environment values out of example output.

## Evidence and release

- Update the relevant guides when behavior changes. Record observed results and exact revisions. For competition evidence use Understand, Plan, Build, Test, Review, Document, Ship, and Automate. Record actual model settings and mark unavailable historical evidence.
- Review the diff, run the applicable verification, and record failures and limitations before calling a change complete. Verify published health and exact deployed SHA separately after an authorized release.
- Keep reviewable work on a branch. Obtain human approval before a push or merge for the final submission. Preserve existing Render, Neon and production credential settings.

