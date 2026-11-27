# Reproduce HydroGrid locally

## Start the release container

Install Git and Docker with Compose v2. The Dockerfile builds React with Node 24 and packages the resulting static files in the Java 21 application. The Compose PostGIS image uses Linux amd64, including on Apple Silicon and other ARM hosts. Enable amd64 emulation when your Docker installation requires it.

```sh
git clone --branch submission-final-audit --single-branch https://github.com/Manu577228/HydroGrid.git
cd HydroGrid
docker compose up -d --build --wait
curl --fail --silent --show-error --retry 25 --retry-delay 2 --retry-all-errors \
  http://127.0.0.1:8080/api/health
```

Open [the local app](http://127.0.0.1:8080/) or the [exercise command center](http://127.0.0.1:8080/#/command). From the landing page choose **Start interactive demo**. Health returns `{"status":"UP","synthetic":true}` when the application can read the seeded spatial tables. Flyway applies migrations on startup. The default Compose configuration creates a named database volume and publishes only the app on loopback. The ordinary exercise works with the built-in local database settings and an ephemeral signing key.

Use an independent Compose project when running beside another copy.

```sh
HYDROGRID_PORT=8088 docker compose -p hydrogrid-audit up -d --build --wait
curl --fail http://127.0.0.1:8088/api/health
HYDROGRID_PORT=8088 docker compose -p hydrogrid-audit down
```

Compose `down` stops the project and retains its database. A deliberate `down -v` deletes that project's local data. Check the project name before removing any volumes.

## Develop with Java and Vite

Use a JDK 21, Maven 3.9+, and Node.js 24. In the repository root, start the database with the development overlay, which adds a loopback binding for port 5433.

```sh
docker compose -p hydrogrid-dev -f compose.yaml -f compose.development.yaml up -d --wait db
```

In a second terminal run the API on port 8081, passing the same local password as the selected Compose database. In a third terminal start the UI on port 5173. Use the exact Vite origin in your browser for cookie-based citizen authentication.

```sh
cd backend
PORT=8081 SPRING_DATASOURCE_PASSWORD="${HYDROGRID_DB_PASSWORD:-hydrogrid-local-only}" mvn spring-boot:run
```

```sh
cd frontend
npm ci
npm run dev
```

Open [the Vite development app](http://127.0.0.1:5173/). Vite proxies `/api` and `/ws` to the backend at `http://localhost:8081` and allows `HYDROGRID_API_URL` to override its target. Use the release container for offline and service-worker verification. Stop development servers with Ctrl+C and run `docker compose -p hydrogrid-dev -f compose.yaml -f compose.development.yaml down` from the repository root.

## Automated checks

```sh
(cd backend && mvn -B -ntp verify)
(cd frontend && npm ci && npm run build)
(cd e2e && npm ci && npx playwright install chromium && npm test)
(cd e2e && npm run check:accessibility)
node deploy/benchmark.mjs
node deploy/benchmark.mjs --study
```

Start the Compose application first for Playwright, accessibility checks and the benchmark. The tests and scripts target `http://127.0.0.1:8080` unless you set `HYDROGRID_BASE_URL`. Linux hosts can install browser system dependencies with `npx playwright install --with-deps chromium`. Maven integration tests require a reachable Docker daemon for Testcontainers. Confirm the skip counts and Docker connectivity before comparing a run with CI. [Testing report](testing.md)

For the complete browser suite, set local-only field and operator fixtures in the same environment before starting an isolated Compose project. The tests keep these writes on localhost.

```sh
export HYDROGRID_FIELD_ACCESS_CODE="hydrogrid-local-fixture-field-code-only"
export HYDROGRID_TEST_FIELD_ACCESS_CODE="$HYDROGRID_FIELD_ACCESS_CODE"
export HYDROGRID_TEST_OPERATOR_CODE="hydrogrid-local-fixture-operator-code-only"
operator_digest=$(printf '%s' "$HYDROGRID_TEST_OPERATOR_CODE" | openssl dgst -sha256 -r | cut -d ' ' -f 1)
export HYDROGRID_OPERATOR_ACCOUNTS="qa-operator:COORDINATOR:$operator_digest"
HYDROGRID_PORT=8088 docker compose -p hydrogrid-audit up -d --build --wait
(cd e2e && HYDROGRID_BASE_URL=http://127.0.0.1:8088 npm test)
HYDROGRID_PORT=8088 docker compose -p hydrogrid-audit down
```

Keep production configuration in the platform secret store. Use `HYDROGRID_DB_PASSWORD` to select a local Compose database password before first initialization, and a stable `HYDROGRID_JWT_SECRET` of at least 32 UTF-8 bytes only when local signing must survive a restart. See [deployment configuration](deployment.md) and [private operations setup](operations.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App port already in use | Select another `HYDROGRID_PORT` and set `HYDROGRID_BASE_URL` to the same port for browser tests and the benchmark. |
| Database readiness or migration fails | Run `docker compose logs db app` with your selected project. Check PostGIS image support, credentials and database volume. A persisted volume keeps the password used when it was first initialized. |
| Citizen login fails in development | Use the browser URL displayed by Vite and let Vite proxy the request. App and API use one origin for mutations. |
| Playwright cannot start Chromium | Install its browser and system dependencies, or use `HYDROGRID_CHROME_PATH` with a compatible existing Chromium binary. |
| Socket unavailable | Confirm that the origin forwards upgrades at `/ws`. The exercise can poll while a visible page lacks a socket. |
| Public feed unavailable | The exercise and simulation run on local data. The sourced city panel shows source availability separately. |
