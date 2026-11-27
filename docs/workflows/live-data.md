# Live information and GPS

Live Bengaluru and City operations separate sourced public feeds, restricted traffic records, and explicitly shared device data. The exercise uses a separate synthetic graph, incidents, fleets, and shelters. Its flood intensity control never changes a sourced street route. [Data attribution](../attribution.md) · [City operations](../operations.md)

## Public streets and weather

```mermaid
flowchart LR
  OSM["Bounded OpenStreetMap extract"] --> Build["Street snapshot generator"]
  Build --> JSON["Dated bundled Bengaluru JSON"]
  JSON --> Roads["Live Bengaluru browser<br/>Dijkstra over directed roads and mapped turn restrictions"]
  Roads --> M["Map route and distance, or no mapped connection"]
  OA["Open-Meteo current conditions"] -->|"Fixed Bengaluru coordinates"| Weather["Browser weather query"]
  Weather --> W["Model timestamp and units, or unavailable status"]
```

The browser draws a bounded, bundled street snapshot between mapped landmarks. The route minimizes mapped road distance and respects the turn restrictions included in the extract. Unknown or disconnected endpoints have no route preview. The snapshot date, coverage and attribution accompany the map. The weather query uses fixed Bengaluru coordinates and refreshes periodically while active. It displays model estimates for the configured coordinates. The app links official weather guidance separately. [Snapshot source and coverage](../../frontend/public/geography/README.md) · [Browser street router](../../frontend/src/geography.ts) · [Weather query](../../frontend/src/liveWeather.ts)

## Official bulletins

```mermaid
flowchart LR
  NDMA["NDMA SACHET Karnataka RSS"] --> Feed["Render alert feed<br/>Fetch and parse scoped bulletins"]
  Feed --> Cache{"Result available?"}
  Cache -->|Fetched| Recent["Available snapshot with check time"]
  Cache -->|Fetch failed and recent cache| Older["Stale snapshot with prior check time"]
  Cache -->|No usable snapshot| Missing["Unavailable status"]
  Recent --> UI["Public Live Bengaluru bulletin panel"]
  Older --> UI
  Missing --> UI
```

The backend reads a fixed source and refreshes its cache on a five-minute interval when requested. A fetch failure can serve a prior successful snapshot marked stale for up to 24 hours. An unavailable feed returns its status and no items. The browser shows the publisher, check time and bulletin dates. Empty or unavailable data provide no evidence that an area is safe. [Bulletin retrieval](../../backend/src/main/java/com/hydrogrid/api/AlertFeed.java) · [Public conditions panels](../../frontend/src/components/LiveConditions.tsx)

## Configured traffic data

```mermaid
sequenceDiagram
  participant O as Enrolled operator browser
  participant A as Render traffic endpoint
  participant I as IUDX resource API
  O->>A: GET /api/ops/traffic-feed with operator bearer token
  A->>A: Verify current enrollment and traffic read permission
  alt Authorized role and configured provider
    A->>I: Request recent Bengaluru Traffic Police events
    I-->>A: Return source records
    A->>A: Filter timestamps and retain newest revision per report
    A-->>O: Return current snapshots or labeled stale or unavailable result
  else Unenrolled or wrong role
    A-->>O: Deny protected feed access
  else Provider credentials missing
    A-->>O: Show connector status
  end
```

Provider credentials stay on Render. The connector checks a recent two-hour window and limits the published result to 25 records. It identifies a closure using provider fields and shows event and check times. Traffic snapshots are kept in server memory and displayed to authorized traffic viewers, traffic operators, or coordinators. The street router reads only its bundled street graph. [Traffic controller](../../backend/src/main/java/com/hydrogrid/api/TrafficFeedController.java) · [Provider integration](../../backend/src/main/java/com/hydrogrid/api/TrafficFeed.java) · [Source authorization and recency](../operations.md#connect-the-iudx-traffic-feed)

## Device permission and private sharing

```mermaid
sequenceDiagram
  actor U as Authorized tester
  participant G as Browser geolocation
  participant B as Live Bengaluru
  participant A as Protected FIELD API
  participant P as Private board storage
  U->>B: Enable device location
  B->>G: Ask browser for permission and watch fixes
  alt Permission and usable fix
    G-->>B: Provide accuracy, coordinates and timestamp in memory
    B-->>U: Display local position
    U->>B: Explicitly share marker or send a test report
    B->>A: Send fresh location or test report with FIELD token
    A->>P: Validate and store device-scoped position or report
    P-->>A: Confirm write
    A-->>B: Acknowledge and show private board status
    opt User stops sharing
      B->>A: Delete current device marker
      A->>P: Remove the authenticated device's position
    end
  else Permission denied or no fresh fix
    B-->>U: Keep location unshared and show the issue
  end
  Note over A,P: Marker visibility is 5 minutes since last update<br/>Test reports are visible for 24 hours
  A->>P: Scheduled cleanup removes expired entries
```

Location requires a secure browser and a user action. The browser keeps a fix local until an authorized tester starts sharing or sends a test report. A fix must be fresh to publish. While sharing is active, the app attempts to update the marker every 10 seconds and retries after an update failure. Other authorized testers see the latest successful marker until it is deleted or five minutes elapse. Test reports use an idempotent device-scoped ID. Visibility windows apply on every board read and a separate cleanup task removes old records every 15 minutes while the backend is running. The private board records test submissions for authorized participants. [Geolocation permission](../../frontend/src/deviceLocation.ts) · [Sharing and failure handling](../../frontend/src/fieldWorkspace.ts) · [Board visibility and expiration](../../backend/src/main/java/com/hydrogrid/api/FieldController.java)
