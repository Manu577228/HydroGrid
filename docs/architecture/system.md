# System context and containers

## Level 1 · System context

The context view identifies who can enter each workspace and which providers supply sourced conditions. The practice users operate fictional records. Private operator and GPS test access require separate credentials.

```mermaid
flowchart TB
  subgraph People["People and permissions"]
    Citizen["Citizen or resident"]
    ExerciseTeam["Exercise coordinator,<br/>responder and shelter operator"]
    FieldOperator["Authorized field<br/>or city operator"]
  end
  subgraph HydroGrid["HydroGrid browser and service boundary"]
    Public["Public Bengaluru<br/>and citizen account"]
    Exercise["Browser-owned<br/>synthetic exercise"]
    Private["Private GPS board<br/>and city operations"]
  end
  Citizen --> Public
  Citizen -->|"Practice SOS"| Exercise
  ExerciseTeam -->|"Owned exercise roles"| Exercise
  FieldOperator -->|"Separate credentials"| Private
  OSM["OpenStreetMap dated extract"] --> Public
  Weather["Open-Meteo<br/>modeled weather"] --> Public
  NDMA["NDMA SACHET<br/>Karnataka bulletins"] --> Public
  IUDX["Bengaluru Traffic Police<br/>via IUDX"] -->|"Scoped road observations"| Private
```

Accounts manage a citizen profile. The exercise proof controls access to a synthetic workspace, with citizen, coordinator, responder and shelter tokens. Private field tests and city operations have separate access and retention policies. Latest sourced road observations are visible to authorized traffic viewers. The public Bengaluru graph still uses a dated OpenStreetMap extract. [Data provenance and attribution](../attribution.md) · [Provider and operator scope](../operations.md) · [Access and retention](data-security.md)

## Level 2 · Master system architecture

The container view follows a report from a browser through a database write and a committed live update. Arrows are labeled by transport or data. The dashed lines indicate the separately configured hosting and build connections.

```mermaid
flowchart TB
  Users["Residents and exercise teams"]
  subgraph Browser["Browser or installed PWA"]
    React["Presentation<br/>React and TanStack Query"]
    Offline["Offline<br/>Workbox and Dexie"]
    React <-->|"Outbox and snapshots"| Offline
  end
  subgraph Edge["Vercel production · frontend hosting"]
    Static["Vite assets and PWA"]
    Rewrite["Same-origin /api<br/>no-store rewrite"]
  end
  subgraph Host["Render · Spring Boot service and combined fallback"]
    REST["JSON REST"]
    STOMP["/ws STOMP"]
    Auth["Security<br/>Origins, JWTs and roles"]
    App["Application<br/>Controllers and stores"]
    Engine["Intelligence<br/>Triage, routing and simulation"]
    Events["Commit listener<br/>Scoped invalidation"]
    Fallback["Combined app shell"]
    REST --> Auth --> App
    App --> Engine
    App -->|"After commit"| Events --> STOMP
    Fallback -->|"Fallback API"| REST
    Fallback -->|"Fallback socket"| STOMP
  end
  subgraph DataProvider["Persistence and provider boundaries"]
    DB[("Neon PostgreSQL<br/>and PostGIS")]
    Weather["Open-Meteo"]
    Feeds["NDMA SACHET<br/>and scoped IUDX"]
  end
  Git["GitHub and Actions"]
  Users --> React
  Static -->|"App shell and dated OSM snapshot"| React
  Fallback -->|"Alternate app shell"| React
  React -->|"HTTPS JSON"| Rewrite --> REST
  React <-->|"Direct WSS and scoped STOMP"| STOMP
  React -->|"Bengaluru weather query"| Weather
  App <-->|"JDBC over TLS and Flyway"| DB
  App -->|"Bound provider clients"| Feeds
  Git -.->|"Frontend build"| Static
  Git -.->|"Container build"| Host
```

| Boundary | Responsibility |
| --- | --- |
| Browser | Renders workflows. IndexedDB preserves pending reports and mission actions independently of the service worker’s precached shell. |
| Vercel | Builds and serves the static assets. It forwards browser API traffic under the frontend origin, preserving first-party cookie behavior. |
| Render | Verifies HTTP roles and socket subscriptions. Transactional stores write the authoritative state and publish exercise topics after commit. The same image serves its own React build as a fallback. |
| Neon | Stores scoped workflow data, account and session data, private test records and spatial data. Versioned Flyway migrations run from the Render application. |
| External data | The browser uses a dated geometry snapshot and Open-Meteo. The backend fetches NDMA bulletins and credentialed IUDX traffic separately from the exercise graph. |

The browser reconciles a committed STOMP signal with scoped REST data. It can also refresh over REST when the socket is interrupted. The separate frontend keeps account cookies first-party without exposing backend secrets in its build. [Frontend client](../../frontend/src/api.ts) · [Vercel rewrite](../../frontend/vercel.json) · [Render configuration](../../render.yaml) · [Backend event publisher](../../backend/src/main/java/com/hydrogrid/config/LiveUpdates.java)

Both production health paths returned `UP` on the split release. Hosted Playwright verified first-party authentication and an actual scoped event from Render. The fallback separately passed targeted mobile, dispatch and STOMP checks. [Verification and tested revisions](../testing.md#dedicated-vercel-release-verification) · [Deployment proof](../deployment.md#verified-split-release)
