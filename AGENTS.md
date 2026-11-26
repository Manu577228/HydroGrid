# Working on HydroGrid

HydroGrid includes a synthetic disaster response exercise and a sourced Bengaluru view. Keep simulated response recommendations distinct from public street, weather, and bulletin data. Device locations and test SOS reports require private field access.

- Start with `docker compose up --build` from the repository root.
- Keep the frontend and API on the same origin. Preserve the `/api` and `/ws` contracts and the hash-based page routes.
- The backend owns authorization, idempotency, spatial decisions, and concurrency invariants. The frontend persists pending operations in IndexedDB and reconciles them with server receipts.
- Use one seeded scenario for both dispatch strategies. Keep outcome metrics reproducible and report all measured values.
- Run `mvn -B -ntp verify` in `backend`, `npm ci && npm run build` in `frontend`, and `npm ci && npm test` in `e2e` against the Compose app.
- Use the provided Flyway migrations for schema changes. Preserve existing migrations and add a new version when changing a released schema.

