# HydroGrid

HydroGrid pairs a flood-response exercise with a live Bengaluru view. The exercise compares two dispatch policies on the same scenario and lets coordinators, citizens, responders, and shelter operators practice under constrained connectivity.

Try the exercise, then see the implementation decisions and test results mapped to the five judging criteria. [Live demo](https://hydrogrid-demo-7v9f.onrender.com/) · [Live Bengaluru](https://hydrogrid-demo-7v9f.onrender.com/#/live) · [Four-minute walkthrough](docs/demo.md) · [Judging evidence](docs/judging.md)

## Run the demo

Requires Docker with Compose. From the repository root:

```sh
docker compose up --build -d
docker compose logs -f app
```

Open [HydroGrid on localhost](http://127.0.0.1:8080/) once the Spring Boot app starts. The app and API share one origin. Docker publishes the web port to loopback and keeps PostgreSQL on the Compose network. Set `HYDROGRID_PORT` to use another local port.

Each browser opens an isolated demo workspace containing fictional reports, resources, and map locations. The app gives that workspace short-lived demo tokens for each role. The Citizen SOS screen accepts fictional reports and saves unsent actions on the device. Keep the app open or reopen it with connectivity to synchronize pending actions.

```sh
docker compose down
```

Compose preserves the database between starts. The private field workspace is disabled unless you configure an access code.

## Walkthrough

| Page | What to demonstrate |
| --- | --- |
| Overview | Launch the exercise and see how the pages fit together. |
| Live Bengaluru | Explore mapped streets, route between landmarks, check current modeled weather and official bulletins, or join a private GPS test. |
| Command center | See ranked reports, route recommendations, unit fit, hazards, and dispatch status. |
| Citizen SOS | Save a synthetic report offline and confirm delivery after reconnecting. |
| Responder console | Advance the assigned mission through en route, on scene, and resolved. |
| Shelters | Check available places, reserve capacity, and record an admission. |
| Simulation lab | Set the seed, incidents, units, flood intensity, and network disruption. Replay both dispatch policies. |
| Analytics & audit | Compare measured scenario outcomes and review the operational event log. |

Follow the four-minute sequence for the offline SOS, flood detour, dispatch, and simulation. [Competition walkthrough](docs/demo.md)

## Live Bengaluru

| Layer | Source and scope |
| --- | --- |
| Streets and landmarks | Bounded central Bengaluru extract from [OpenStreetMap](https://www.openstreetmap.org/copyright) under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). HydroGrid traces a road route between mapped landmarks. Confirm access, traffic, flood conditions, and closures with local authorities before driving. |
| Current conditions | [Open-Meteo](https://open-meteo.com/en/docs) weather model for central Bengaluru. Values carry the source timestamp. [IMD Bengaluru](https://mausam.imd.gov.in/bengalurums/) publishes official weather information. |
| State bulletins | [NDMA SACHET](https://sachet.ndma.gov.in/CapFeed) Karnataka RSS. Entries show their original issue dates and may include expired notices. Follow the issuing authority's instructions and bulletin validity periods. |
| Device GPS | Browser geolocation, activated by the device owner. GPS is shown locally until the user shares it or sends a test SOS to the private workspace. |

The public exercise uses simulated incidents, dispatch, flood polygons, closures, and shelter capacity. A real flood response needs official operational data and enrolled operators. In India, use [112](https://www.mha.gov.in/emergency-response-support-system-erss) for emergencies.

### Private field test

For a trusted test group, set `HYDROGRID_FIELD_ACCESS_CODE` to a password-manager-generated code of at least 32 random characters. Set it in the service environment for a hosted deployment and redeploy, or set it in the shell before running Compose. Use HTTPS on phones. Open **Live Bengaluru**, unlock **Private field test** on each trusted device, and allow location when you choose **Enable device location**. The workspace shows the latest position per sharing device. Stop sharing to remove your position, or it disappears from the board five minutes after the last update. Test SOS reports are visible for 24 hours. Both expire from active storage through scheduled cleanup. When the free host sleeps, cleanup runs after the app wakes and the scheduled interval elapses.

Store the code outside Git, rotate it to revoke previously issued access tokens, and share it only with people authorized to see every position and report in that workspace. Sessions expire after eight hours. Test SOS is a private exercise with a real GPS fix. For emergencies, call 112.

## Verify

```sh
(cd backend && mvn -B -ntp verify)
```

The backend tests use Java 21 and a Docker-backed PostgreSQL/PostGIS fixture.

```sh
(cd e2e && npm ci && npx playwright install chromium && npm test)
```

Run the browser tests while the Compose app is listening. Set `HYDROGRID_BASE_URL` to exercise a different deployment. `node deploy/benchmark.mjs` queries a running app and reproduces the [three fixed benchmark scenarios](docs/benchmarks.md).

## Neon tooling in Codex

The Neon skills live in `.agents/skills`. The project MCP configuration uses Neon's official HTTPS endpoint. Open this repository as a trusted Codex project and complete Neon OAuth on first use. The local `.neon` link is ignored by Git.

## Deploy on the free tier

The root `Dockerfile` bundles the Vite build inside the Spring Boot jar. The Render Blueprint provisions a Free Docker web service in Singapore and generates its JWT secret. Neon hosts PostgreSQL 16 with PostGIS.

1. Create a Neon Free project with PostgreSQL 16 in AWS Asia Pacific (Singapore). In its **Connect** dialog, turn off **Connection pooling** to get the direct host, database, role, and password. HydroGrid uses its own small JDBC pool and runs Flyway migrations during startup. The initial migration enables PostGIS using the database owner's role. [Neon regions](https://neon.com/docs/introduction/regions) · [Direct connections](https://neon.com/docs/connect/connection-pooling) · [PostGIS](https://neon.com/docs/extensions/postgis)
2. In Render, create a Blueprint from the Git repository, using `main` and `render.yaml`. Confirm the service shows the Free plan. Enter these three values in Render's environment settings. The sample host and database are placeholders. [Render environment settings](https://render.com/docs/configure-environment-variables)

   | Environment variable | Value |
   | --- | --- |
   | `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<direct-neon-host>:5432/<database>?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory&channelBinding=require` |
   | `SPRING_DATASOURCE_USERNAME` | Neon database owner's role from the Connect dialog |
   | `SPRING_DATASOURCE_PASSWORD` | The role's password, stored in Render |

   The URL uses the JVM trust store and verifies the database hostname. Store credentials in the Render environment. [Neon secure connections](https://neon.com/docs/connect/connect-securely) · [pgJDBC TLS settings](https://jdbc.postgresql.org/documentation/ssl/)
3. After deployment, open the web service URL and verify that `/api/health` returns `UP` with `synthetic: true`. Open the Command Center to confirm the sample reports load. Render probes the web page so routine hosting checks let the database idle.

For an existing Render deployment, sync the updated Blueprint and enter the three settings directly on the service. In the same environment edit, remove the legacy `HYDROGRID_DATABASE_URL` so the entrypoint uses the new JDBC URL. To carry existing demo sessions forward, restore a backup into the Neon database before the cutover. An empty Neon database starts with freshly initialized exercise state. [Updating Blueprint secrets](https://render.com/docs/blueprint-spec#setting-environment-variables) · [Neon backups and restores](https://neon.com/docs/manage/backup-pg-dump)

Render Free provides 750 instance hours per workspace per calendar month. The web service spins down after 15 idle minutes and can take about a minute to wake. Neon Free has no time limit and includes 1 GB of storage, 100 compute-unit hours per month, and 5 GB of public transfer per project per month. Neon suspends compute after five minutes of database inactivity. [Render Free](https://render.com/docs/free) · [Neon Free](https://neon.com/pricing)

### Temporary public preview

With the synthetic release running locally, create a zero-cost HTTPS preview:

```sh
docker compose -f compose.yaml -f compose.preview.yaml up -d
docker compose -f compose.yaml -f compose.preview.yaml logs tunnel
```

Share the printed `trycloudflare.com` URL. Access lasts while the machine is awake, online, and running Docker and the tunnel container. Stop the link with `docker compose -f compose.yaml -f compose.preview.yaml stop tunnel`. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Implementation

React, TypeScript, Vite, Tailwind, Leaflet, Recharts, TanStack Query, Dexie and Workbox form the browser application. Spring Boot, Spring Security, JWT and STOMP handle API requests and live updates. Flyway, PostgreSQL 16, PostGIS, Hibernate Spatial and JTS support the spatial data model. Java implements triage, routing, dispatch, and simulation. Docker Compose and GitHub Actions run the release and checks.

The exercise uses a bounded fictional road network near Bengaluru. Its routes and severity bands support scenario replay. The Live Bengaluru page displays its own sourced geography, weather, and bulletin data. See [engineering notes](docs/engineering.md).
