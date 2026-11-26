# HydroGrid

HydroGrid is a synthetic flood-response exercise for coordinators, citizens, responders, and shelter operators. It runs disaster scenarios under constrained connectivity and compares two dispatch policies against the same seeded events.

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

Compose preserves the demo database between starts. The volume holds only synthetic exercise state.

## Walkthrough

| Page | What to demonstrate |
| --- | --- |
| Overview | Launch the exercise and see how the pages fit together. |
| Command center | See ranked reports, route recommendations, unit fit, hazards, and dispatch status. |
| Citizen SOS | Save a synthetic report offline and confirm delivery after reconnecting. |
| Responder console | Advance the assigned mission through en route, on scene, and resolved. |
| Shelters | Check available places, reserve capacity, and record an admission. |
| Simulation lab | Set the seed, incidents, units, flood intensity, and network disruption. Replay both dispatch policies. |
| Analytics & audit | Compare measured scenario outcomes and review the operational event log. |

See the [competition walkthrough](docs/demo.md) for a four-minute sequence.

## Verify

```sh
(cd backend && mvn -B -ntp verify)
```

The backend tests use Java 21 and a Docker-backed PostgreSQL/PostGIS fixture.

```sh
(cd e2e && npm ci && npx playwright install chromium && npm test)
```

Run the browser tests while the Compose app is listening. Set `HYDROGRID_BASE_URL` to exercise a different deployment. `node deploy/benchmark.mjs` queries a running app and reproduces the [three fixed benchmark scenarios](docs/benchmarks.md).

## Deploy on the free tier

The root `Dockerfile` bundles the Vite build inside the Spring Boot jar. `render.yaml` provisions one Free Docker web service and one Free PostgreSQL 16 database in Singapore. It supplies private database connection details and a generated JWT secret. The Flyway migration enables PostGIS.

In Render, create a Blueprint from the Git repository with `main` and `render.yaml`. Confirm both resources show the Free plan. After deployment, open the web service URL and check `/api/health`. Render's free app can take about a minute to wake after inactivity. The free database expires 30 days after creation. [Render free tier](https://render.com/docs/free)

### Temporary public preview

With the synthetic release running locally, create a zero-cost HTTPS preview:

```sh
docker compose -f compose.yaml -f compose.preview.yaml up -d
docker compose -f compose.yaml -f compose.preview.yaml logs tunnel
```

Share the printed `trycloudflare.com` URL. Access lasts while the machine is awake, online, and running Docker and the tunnel container. Stop the link with `docker compose -f compose.yaml -f compose.preview.yaml stop tunnel`. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Implementation

React, TypeScript, Vite, Tailwind, Leaflet, Recharts, TanStack Query, Dexie and Workbox form the browser application. Spring Boot, Spring Security, JWT and STOMP handle API requests and live updates. Flyway, PostgreSQL 16, PostGIS, Hibernate Spatial and JTS support the spatial data model. Java implements triage, routing, dispatch, and simulation. Docker Compose and GitHub Actions run the release and checks.

HydroGrid uses a bounded fictional road network near Bengaluru. Routes and severity bands are simulated decision support for the exercise. They are unsuitable for real navigation or clinical triage. See [engineering notes](docs/engineering.md).
