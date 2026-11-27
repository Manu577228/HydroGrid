# Testing and verification

Release verification covers the deployed main revision `940edb064d90053414370addb871f6b33e997e93` and the isolated `submission-final-audit` candidate prepared on Nov 27, 2026 IST. The two builds have separate evidence and approval states.

| Check | Candidate or deployed revision | Outcome |
| --- | --- | --- |
| Maven unit and PostGIS integration | Local candidate | 24 passed, 0 failures, 0 errors, 0 skipped |
| Standalone client build and same-image packaging | Local candidate | npm lockfile install, TypeScript, Vite and PWA build passed. The candidate bundles 157.15 kB gzip for main JS and 17.37 kB gzip for the dashboard chunk, with 68 precache entries. A fresh Compose project reached healthy with PostgreSQL 16.9, PostGIS 3.5.2 and Flyway V5 applied. |
| Browser and API | Local candidate, isolated Compose | 17 passed, including three local fixture cases |
| Citizen logout navigation | Local candidate | Eight passed across two groups of four, covering signup, profile restore, logout, protected-route and sign-in |
| Responsive and accessibility | Local candidate | 120 Chromium and axe scans. Zero violations, unexpected page errors, or horizontal overflow in the tested states. |
| Hosted browser and API | Deployed main | 14 passed, 3 local fixture cases skipped. The run covered public mobile navigation, offline replay, scoped WebSocket delivery, dashboard updates and other synthetic workflow checks. |
| GitHub Actions | Deployed main | Backend and release jobs passed on the same commit that Render serves. |
| CI and hosted verification | Submission candidate | Local verification recorded above. GitHub Actions and the Render release gate require authorized publication. |

[Deployed main CI run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328) · [Deployment and recovery evidence](deployment.md) · [Reviewed findings](evidence/REVIEW_FINDINGS.md)

## Reproduce the core checks

Run these commands with Docker, Java 21, Maven 3.9, and Node 24 at the repository root. Start a local app as described in [setup](setup.md). Fixture-only tests expect the operator and field environment shown in the [CI workflow](../.github/workflows/ci.yml). Use isolated local values.

```sh
(cd backend && mvn -B -ntp verify)
(cd frontend && npm ci && npm run build)
(cd e2e && npm ci && npx playwright install chromium && npm test)
(cd e2e && npm run check:accessibility)
node deploy/benchmark.mjs --study > dispatch-study.json
```

A first burst of eight account tests hit the normal per-address registration limit after five successes. The repeated test passed eight times in two groups of four, with a restart of the disposable QA container between groups. The complete 17-test run passed after the second group.

The Maven suite uses Testcontainers and a disposable PostGIS database. It covers triage, routes, replay, time-bucketed dashboard queries, account rotation and revocation, duplicate reports, and concurrent assignment and shelter updates. Playwright checks physical browser disconnection, persistence across reload, idempotent sync, seeded comparison, token and ownership gates, workspace-scoped STOMP, login and profile, private GPS fixture and enrolled operator fixture. Set the target URL through `HYDROGRID_BASE_URL` after checking the target’s scope. The accessibility and benchmark commands are intended for local playback.

## Accessibility and manual workflow

The pinned `axe-core` 4.14.1 runner checks both themes at 360, 390, 768, 1024, 1440 and 1920 CSS pixels. It tests eight core routes at every size and six additional routes at 390 and 1440 px. The script waits for key data-backed landmarks on relevant pages and detects horizontal overflow and uncaught page errors. Browser cases separately exercise mobile navigation, keyboard search, accessible form labels, offline delivery status, and theme persistence.

The browser walkthrough used a real browser network disconnect and followed SOS receipt, triage, dispatch confirmation, responder milestones, a linked shelter check-in, and committed audit. The hosted Playwright pass also verified mobile route navigation. These checks have limited screen reader, map interaction, and platform coverage. [Judge walkthrough](demo.md) · [Scan results](data/accessibility.ndjson)

## Bounded local timings

Measured Nov 27 on a macOS arm64 client and isolated local Docker. Each route lists 15 sequential Node fetch-plus-JSON samples after two discarded warm-ups on one seeded workspace. The p95 is nearest rank, which equals the maximum at this sample size.

| Warm local read | Median | p95 |
| --- | ---: | ---: |
| Health | 1.60 ms | 3.80 ms |
| Dashboard | 4.59 ms | 7.88 ms |
| Incidents | 1.06 ms | 1.25 ms |
| Shelters | 0.83 ms | 1.13 ms |

The previous 2.0 release measured browser readiness in three warm local Chromium runs per view with the service worker blocked. Its medians were 63 ms for the landing heading, 873 ms for the command review action, and 881 ms for the dashboard KPI. Network distance, free-tier cold start, database size and concurrent traffic would change these values. The sample establishes observed local timings. [API timing samples](data/local-api-timing.ndjson) · [Browser measurement details](release-2.0.md) · [Simulation study](benchmarks.md)

## CI history

The first attempt of main run `45895773437` hit HTTP 429 resolving the Spring Boot parent POM inside Docker. A later attempt built the Docker image and exposed a separate account test failure immediately after sign-out. Main run `45938609328` completed both required jobs. The submission branch fixes the competing profile redirects and waits for the expected browser route before exercising protected navigation. The backend framework version remains at Spring Boot 3.5.16. [Historical run](https://github.com/Manu577228/HydroGrid/actions/runs/45895773437) · [Passing main run](https://github.com/Manu577228/HydroGrid/actions/runs/45938609328)
