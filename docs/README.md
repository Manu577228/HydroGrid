# HydroGrid documentation

Start with the public exercise and follow one fictional incident to its audit record. Use the architecture and workflow views to understand why a page behaves as it does, then use the Evidence Pack to inspect the decisions and verification behind it. [Live exercise](https://hydrogrid-response.vercel.app/) · [Project README](../README.md) · [90-second walkthrough](demo.md)

## Read by task

| Document | What you can learn or do | Lifecycle stage |
| --- | --- | --- |
| [Judge walkthrough](demo.md) | Try a synthetic SOS, report through a connectivity loss, compare a route, and finish a response. | Understand, Test |
| [Product showcase](showcase.md) and [demo storyboard](demo-script.md) | See the actual desktop and mobile product and follow the two-minute recording plan. | Document |
| [Architecture](architecture/README.md) | Read the system-context, container and component views, then follow responsibilities between hosts. | Plan, Build |
| [Database ER and security views](architecture/data-security.md) | Inspect migrations, role boundaries, storage and transactional consistency. | Plan, Review |
| [Workflow atlas](workflows/README.md) | Trace the operational state machines, request sequences, retries, failures, and seeded policy replay. | Build, Test |
| [Diagram catalog](diagrams.md) | Find the visual system and workflow references and the two standalone SVG exports. | Plan, Document |
| [Engineering notes](engineering.md) | Follow implementation choices and trade-offs through the application. | Plan, Build |
| [API reference](api.md) | Use the REST and STOMP contracts with synthetic examples. | Build, Document |
| [Setup](setup.md) | Build the combined app locally, run migrations and configure test-only roles. | Document, Ship |
| [Testing and verification](testing.md) | Reproduce Java, PostGIS, browser, authorization, accessibility and hosted checks. | Test, Review |
| [Dispatch study](benchmarks.md) | Re-run nine paired policy comparisons and read the critical-coverage and tail-latency trade-off. | Test |
| [Security review](security.md) | Inspect account cookies, exercise ownership, privacy, bounded dependency scans and residual risk. | Review |
| [Production deployment](deployment.md) and [infrastructure views](architecture/deployment.md) | Trace builds to Vercel and Render, verify the Neon-backed API and understand recovery options. | Ship, Automate |
| [Live operations](operations.md) and [data attribution](attribution.md) | Interpret independently sourced weather, streets, alerts, gated road reports and private GPS. | Understand, Review |
| [Release history](release-2.0.md) | Compare 2.0 behavior and verification with the earlier combined release. | Ship |
| [Codex Evidence Pack](evidence/CODEX_EVIDENCE_PACK.md) | Read the actual model record, implementation activity, user decisions and eight-stage evidence. | All eight |
| [Judging guide](judging.md) and [traceability matrix](evidence/TRACEABILITY_MATRIX.md) | Find the code, tests, commits and deployment evidence behind each judging claim. | All eight |
| [Submission checklist](submission-checklist.md) and [AGENTS.md](../AGENTS.md) | Verify entry links and preserve the project's reusable engineering instructions. | Document, Automate |

## The evidence trail

1. [Understand](evidence/lifecycle/01-understand.md) — frame the emergency coordination problem and operating boundaries.
2. [Plan](evidence/lifecycle/02-plan.md) — choose scope, state ownership and verification strategy.
3. [Build](evidence/lifecycle/03-build.md) — inspect the shipped React, Java, PostGIS and policy implementation.
4. [Test](evidence/lifecycle/04-test.md) — distinguish local, browser, CI and hosted observations.
5. [Review](evidence/lifecycle/05-review.md) — trace actual findings to fixes and regression checks.
6. [Document](evidence/lifecycle/06-document.md) — connect the introductory guide to reproducible evidence.
7. [Ship](evidence/lifecycle/07-ship.md) — verify provider revisions, health and the combined fallback.
8. [Automate](evidence/lifecycle/08-automate.md) — follow CI triggers, hosted builds and in-app recovery.

## What the results represent

- **Practice data.** Citizens, responders, incidents, route closures and shelter capacity in the guest exercise are fictional. Browser tests target separate workspaces.
- **Public source data.** The street snapshot covers a bounded part of Bengaluru. The weather model and alerts have independent timestamps. The traffic viewer requires authorization. [Attribution and coverage](attribution.md)
- **Private field input.** Location sharing requires consent and an authenticated board. Verification uses controlled fixtures, and public screenshots show the exercise or public map. [Security and privacy](security.md)
- **Release evidence.** The production branch and two provider builds can have different commit identifiers when a later commit changes documentation. Read the verified application revision and hosted smoke results together. [Deployment record](deployment.md)

[Source and commit history](https://github.com/Manu577228/HydroGrid/tree/submission-final-audit) · [CI](https://github.com/Manu577228/HydroGrid/actions/workflows/ci.yml?query=branch%3Asubmission-final-audit) · [Backend health](https://hydrogrid-demo-7v9f.onrender.com/api/health)
