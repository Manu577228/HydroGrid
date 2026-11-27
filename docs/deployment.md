# Deployment and recovery

The [Render API and combined fallback](https://hydrogrid-demo-7v9f.onrender.com/) run the repository's root Dockerfile on a Render Free web service. The build copies the React output into the Spring Boot JAR and runs Java 21 as an unprivileged container user. Render terminates HTTPS. The application uses a separately managed Neon PostgreSQL database with TLS and the PostGIS extension. Compose provides the runnable fallback on one machine. [Local setup](setup.md)

## Dedicated Vercel frontend

| Endpoint | Responsibility |
| --- | --- |
| [Vercel frontend](https://hydrogrid-response.vercel.app/) | Public React and TypeScript application, static assets and PWA shell. |
| [Vercel API health](https://hydrogrid-response.vercel.app/api/health) | Same-origin HTTPS rewrite to the existing Spring Boot API. |
| [Render backend health](https://hydrogrid-demo-7v9f.onrender.com/api/health) | Direct readiness and a database-backed graph check. |
| [Render fallback](https://hydrogrid-demo-7v9f.onrender.com/) | Combined app with a local same-origin API and WebSocket endpoint. |

The existing Vercel project is connected to GitHub with root directory `frontend`, Vite, and production branch `submission-final-audit`. Vercel automatically builds the frontend on a push to that branch. Render keeps the same service and Neon database and follows `main` after the split application was merged through PR #3. The final submission documentation is published on `submission-final-audit`. [Split rollout PR](https://github.com/Manu577228/HydroGrid/pull/3)

[vercel.json](../frontend/vercel.json) forwards `/api/*` to Render and sends no-store directives on API responses. Browser API calls stay same-origin, including account mutations. The refresh cookie is host-scoped with `HttpOnly`, `Secure`, `SameSite=Strict` and `Path=/api/account`. A direct cross-site browser mutation is rejected. The browser opens STOMP over `wss://hydrogrid-demo-7v9f.onrender.com/ws` using the Vercel production build variable `VITE_HYDROGRID_WS_URL`. Render configures `HYDROGRID_FRONTEND_ORIGIN=https://hydrogrid-response.vercel.app`, the exact allowed Vercel origin. STOMP still authorizes the owned exercise topic with its scoped token.

The app uses hash routes such as `/#/dashboard`. The service worker caches the frontend shell and leaves `/api` and `/ws` outside the navigation fallback. IndexedDB retains pending SOS and mission actions until the backend acknowledges them. The WebSocket endpoint is public configuration. Database, signing and operator credentials remain on the backend. Preview URLs have a different origin and do not receive production-origin cookie or socket permission.

## Verified split release

On November 27, 2026 IST, Vercel production deployment `dpl_r7TKbbHxwzL4M2YNC1sDPQHyXAW8` built integration commit `5d08129b5e08847322d509318c9fd637c7f0c883` from a Git push. Render deploy `dep-dc4kgl17lnhs738r3p1g` reported the same revision live. Both health URLs returned `UP`. The Vercel response explicitly disallows API caching. [Integration commit](https://github.com/Manu577228/HydroGrid/commit/5d08129b5e08847322d509318c9fd637c7f0c883) · [Successful GitHub Actions run](https://github.com/Manu577228/HydroGrid/actions/runs/45970866151)

Playwright on Vercel verified first-party account signup, secure cookie attributes, profile restoration and logout. Direct STOMP negotiated `CONNECTED` with Render and delivered the workspace updates. The test suite covered dashboard data and chart drill-down, routes, offline SOS and responder sync, dispatch, shelter admission, simulation, mobile, and keyboard navigation. Three additional checks passed on the Render fallback. [Test results and reproduction](testing.md)

The manifest and service worker loaded from Vercel and 40 served JavaScript chunks were scanned for credential markers, database URLs and private keys, with no matches. The proxied first-party refresh reached Render, direct cross-site refresh returned 403, and unauthenticated profile access returned 401. Render's own first-party refresh remained available.

## Current Render fallback

Render reports `dep-dc4km5s9v7es73fbnuqg` live for merge commit `388edee75d37a16584f2f1cfc718cfc5baf2970f` on `main`. The application files match the tested split-release tree, and both direct and proxied health returned `UP` again. [Main merge](https://github.com/Manu577228/HydroGrid/commit/388edee75d37a16584f2f1cfc718cfc5baf2970f) · [Vercel health](https://hydrogrid-response.vercel.app/api/health) · [Render health](https://hydrogrid-demo-7v9f.onrender.com/api/health)

## Prior combined release

The previous combined release was [`940edb064d90053414370addb871f6b33e997e93`](https://github.com/Manu577228/HydroGrid/commit/940edb064d90053414370addb871f6b33e997e93). Render reported deploy `dep-dc4g6g8473hc739iei30` live for that revision. The [main-branch GitHub Actions run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) passed both backend and release jobs.

The 27 November 2026 IST release check read `/api/health` with status `UP` and `synthetic: true`. Anonymous profile requests returned 401, and a negative same-origin login reached credential checking. The authenticated private road viewer read the feed, which returned zero road reports in its current two-hour window for that check. A separate competition audit against the same public revision repeated the browser checks with 14 passing and three fixture-only writes skipped. Those writes cover citizen accounts, private field GPS and private operator records. The hosted browser suite also covered real STOMP delivery, practice reporting, offline recovery and mobile navigation. [Health endpoint](https://hydrogrid-demo-7v9f.onrender.com/api/health) · [Testing report](testing.md) · [City operations notes](operations.md)

The first request after idle can take longer while Render starts the container. An initial release QA run observed a cold restart. Exercise pages, mobile rendering and assets were verified after readiness. A front-page response alone cannot prove the database is ready.

## Environment and release flow

| Setting | Role |
| --- | --- |
| `PORT`, `HYDROGRID_DEMO_ENABLED` | Container listener and controlled exercise token availability. The blueprint configures port 8080 and enables the exercise. |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | Neon JDBC connection with TLS full verification and required channel binding, entered in the platform secret store. Flyway runs V1 through the current migration on startup. |
| `HYDROGRID_JWT_SECRET` | Stable signing secret provisioned by the platform. The application requires at least 32 UTF-8 bytes when a secret is configured. |
| `HYDROGRID_FIELD_ACCESS_CODE`, `HYDROGRID_OPERATOR_ACCOUNTS` | Optional and independently authorized private access. |
| `HYDROGRID_IUDX_CLIENT_ID`, `HYDROGRID_IUDX_CLIENT_SECRET` | Optional connector credentials for authorized operator viewing of Bengaluru traffic reports. |

The [Render blueprint](../render.yaml) sets the platform HTTP health path to `/`. Verify `/api/health` separately because it checks the database-backed seeded graph and returns 503 on database readiness failure. CI builds and starts the same Dockerfile, waits on that API path, and runs Playwright. Its backend job performs Maven verification with Testcontainers. A previous Docker build encountered a transient Maven Central 429. The verified main run and its complete release job succeeded without changing the backend framework.

For an approved release, compare the deployment-branch GitHub revision with Vercel and Render provider status. Check the landing page, application readiness, a browser-owned exercise, one mobile flow, unauthenticated access denials and STOMP delivery. Confirm Neon readiness with the updated JDBC driver and existing TLS settings. Maintain private access configuration across releases. Deploying a pending submission branch is a separate approval.

## Recover or roll back

Prefer a tested forward correction that preserves workspace ownership and additive data migrations. Render can redeploy a previous build artifact from the service's Events page. Check the chosen revision and its environment before taking action. The database and versions applied by Flyway remain after an image rollback. [Render rollback guide](https://render.com/docs/rollbacks)

In isolated Compose, the earlier image used in the previous release verification started against schema V5 and `/api/health` was UP. Flyway identified V5 as newer than that image's V3. This established startup compatibility for that particular rollback on a test database. The previous image predates the exercise ownership protection. Keep that limitation in any recovery decision, and verify migration compatibility and access checks for the chosen revision.
