# Deployment and recovery

[Public HydroGrid](https://hydrogrid-demo-7v9f.onrender.com/) runs the repository's root Dockerfile on a Render Free web service. The build copies the React output into the Spring Boot JAR and runs Java 21 as an unprivileged container user. Render terminates HTTPS. The application uses a separately managed Neon PostgreSQL database with TLS and the PostGIS extension. Compose provides the runnable fallback on one machine. [Local setup](setup.md)

## Verified public revision

The last verified release is [`940edb064d90053414370addb871f6b33e997e93`](https://github.com/Manu577228/HydroGrid/commit/940edb064d90053414370addb871f6b33e997e93). Render reported deploy `dep-dc4g6g8473hc739iei30` live for that revision. The [main-branch GitHub Actions run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) passed both backend and release jobs.

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

After human approval, merge the reviewed release and compare the GitHub revision with Render's active deploy. Check the landing page, application readiness, a browser-owned exercise, one mobile flow, unauthenticated access denials and STOMP delivery. Confirm Neon readiness with the updated JDBC driver and existing TLS settings. Maintain private access configuration across releases. Deploying a pending submission branch is a separate approval.

## Recover or roll back

Prefer a tested forward correction that preserves workspace ownership and additive data migrations. Render can redeploy a previous build artifact from the service's Events page. Check the chosen revision and its environment before taking action. The database and versions applied by Flyway remain after an image rollback. [Render rollback guide](https://render.com/docs/rollbacks)

In isolated Compose, the earlier image used in the previous release verification started against schema V5 and `/api/health` was UP. Flyway identified V5 as newer than that image's V3. This established startup compatibility for that particular rollback on a test database. The previous image predates the exercise ownership protection. Keep that limitation in any recovery decision, and verify migration compatibility and access checks for the chosen revision.
