# Triage, routing and rescue response

## Incident lifecycle

```mermaid
stateDiagram-v2
  [*] --> REPORTED: Citizen or coordinator submits
  REPORTED --> REPORTED: Review and optional severity override
  REPORTED --> ASSIGNED: Coordinator dispatches eligible unit
  ASSIGNED --> EN_ROUTE: Responder or coordinator advances
  EN_ROUTE --> ON_SCENE: Responder or coordinator advances
  ON_SCENE --> RESOLVED: Responder or coordinator closes mission
  RESOLVED --> [*]
```

Initial triage is calculated for the reported record. A coordinator may override severity before resolution, with a reason recorded in the workspace audit. Severity review changes the priority shown to the coordinator and leaves the incident status unchanged. Unit assignment begins with dispatch. The server permits the ordered progression shown and rejects an invalid transition with a conflict. The five states are the actual persisted statuses. [State enum and request DTOs](../../backend/src/main/java/com/hydrogrid/api/Models.java) · [Role requirements](../../backend/src/main/java/com/hydrogrid/api/OperationsController.java) · [Transaction logic](../../backend/src/main/java/com/hydrogrid/store/IncidentStore.java)

## Triage and prioritization

```mermaid
flowchart TD
  Input["Reported urgency, hazard, headcount, depth, medical or vulnerability flags, danger"] --> Validate{"Valid role and report fields?"}
  Validate -->|No| Reject["Reject request"]
  Validate -->|Yes| Infer["Infer highest qualifying exercise severity"]
  Infer --> Band["Higher of reported and inferred severity"]
  Review["Coordinator may set a band and reason before resolution"] --> Score
  Band --> Score["Base points and bounded report factors"]
  Score --> Order["Sort by descending score, then creation time and incident ID"]
  Order --> UI["Show priority and score contributions"]
```

| Rule | Result |
| --- | --- |
| Immediate danger or depth ≥ 100 cm | Critical inference |
| Medical need or medical hazard, depth ≥ 55 cm, or headcount ≥ 8 | High inference when critical does not apply |
| Vulnerability, depth ≥ 20 cm, or headcount ≥ 4 | Medium inference when higher thresholds do not apply |
| Other reports | Low inference |
| Score | Band ordinal × 100, plus up to 20 for headcount, 25 for medical urgency, 15 for vulnerability, up to 8 for depth, and up to 30 for waiting time while reported |

The person reporting the incident can choose a higher band. Missing reported severity defaults to low before inference. An explicit coordinator override supplies the scoring band directly and records its reason. These rules are deterministic. They use entered exercise details and should be interpreted as practice triage. [Scoring and thresholds](../../backend/src/main/java/com/hydrogrid/engine/HydroEngine.java) · [Ordering and override](../../backend/src/main/java/com/hydrogrid/store/IncidentStore.java) · [Engine tests](../../backend/src/test/java/com/hydrogrid/engine/HydroEngineTest.java)

## Flood-aware routing

```mermaid
flowchart LR
  Graph["Synthetic road graph"] --> Route["Dijkstra on open edges<br/>Weight is estimated travel minutes"]
  Incident["Incident location<br/>Nearest exercise node"] --> Route
  Unit["Rescue unit location<br/>Stored exercise node"] --> Route
  Flood["Active exercise flood polygons"] --> Intersection["PostGIS ST_Intersects<br/>Polygon against road lines"]
  Intersection --> Closed["Blocked road IDs"] --> Route
  Route --> Found{"Destination reachable?"}
  Found -->|Yes| Return["Return shortest open route<br/>It may be a detour"]
  Found -->|No| Empty["Return unreachable and no path"]
```

```mermaid
flowchart LR
  Market["N06 · Market Cross"] <-->|"R05 · open when dry, closed at 40%"| Canal["N07 · Canal Bridge"]
  Market <-->|"R26 · open alternative"| Detour["N11 · intermediate node"]
  Detour <-->|"R19 · open alternative"| Canal
```

In the verified example, the dry route uses R05. Applying 40% exercise flood intensity closes it and the open path detours through N11. Each road is weighted by stored distance and speed. The server excludes all intersecting segments from the route search. Closure geometry and travel speeds are exercise inputs. The sourced Bengaluru street preview has a separate routing graph and receives no exercise or field closures. [Spatial intersection](../../backend/src/main/java/com/hydrogrid/store/SpatialGraph.java) · [Road and detour implementation](../../backend/src/main/java/com/hydrogrid/engine/RoadNetwork.java) · [Route test](../../e2e/tests/api.spec.mjs) · [Sourced street route](live-data.md#public-streets-and-weather)

## Rescue resource matching

```mermaid
flowchart TD
  Input["Reported incident needs and current exercise fleet"] --> Available["Keep available units with required equipment"]
  Available --> Open["Keep units with an open route"]
  Open --> Capacity["Keep units with enough seats"]
  Capacity --> Any{"Eligible units?"}
  Any -->|Yes| Rank["Rank by travel minutes, spare seats<br/>and avoidable specialist equipment"]
  Rank --> Recommend["Show ranked options and route"]
  Any -->|No| Reason["Explain missing capability, blocked routes,<br/>or need for multiple trips or units"]
```

Medical incidents require medical equipment. Floods require a boat or high-clearance equipment, and depths of at least 55 cm require a boat. The HydroGrid matcher adds 0.35 per spare seat, 1.25 for using a boat when its specialty is unnecessary, and 0.85 for unnecessary medical equipment. Lower rank wins. Travel time and unit ID resolve ties. Recommendations use a snapshot of current availability and routing. The dispatch transaction rechecks eligibility. Capacity shortfalls receive a suggestion to coordinate multiple units or trips. The app has no automatic multi-unit allocation. [Matcher and tie-breakers](../../backend/src/main/java/com/hydrogrid/engine/HydroEngine.java) · [Recommendation endpoint](../../backend/src/main/java/com/hydrogrid/api/OperationsController.java)

## Transactional dispatch

```mermaid
sequenceDiagram
  actor C1 as Coordinator
  actor C2 as Concurrent request
  participant API as Role-protected API
  participant S as IncidentStore
  participant D as PostgreSQL and audit
  participant B as STOMP broker
  C1->>API: Confirm dispatch and selected unit
  API->>S: Validate coordinator and workspace
  S->>D: Lock hazard snapshot for share and incident for update
  S->>S: Recalculate available compatible units and route
  C2->>API: Dispatch the same unit to another incident
  API->>S: Authorize and validate competing request
  S->>D: First conditional update locks unit and sets BUSY
  S->>D: Second conditional update waits for the unit row
  S->>D: Assign first incident and insert audit
  D-->>S: First transaction commits
  S-->>C1: Return committed assignment
  S-->>B: Publish scoped invalidation after commit
  D-->>S: Second conditional availability check fails
  alt Explicit unit chosen or no options remain
    S-->>C2: Return conflict
  else Automatic dispatch and another eligible unit exists
    S->>D: Attempt next candidate under the same rules
  end
```

The incident row lock serializes competing assignments to the same incident. Repeating the matching active assignment can return the existing incident. Conflicting requests fail. For different incidents contending over one rescue unit, the conditional `AVAILABLE → BUSY` update takes a unit-row lock and rechecks eligibility when the earlier write commits. Assignment and its audit commit together. An uncommitted attempt produces no scoped event. [Dispatch code](../../backend/src/main/java/com/hydrogrid/store/IncidentStore.java) · [Concurrent dispatch integration test](../../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java)

## Responder mission lifecycle

```mermaid
stateDiagram-v2
  [*] --> ASSIGNED: Coordinator dispatch confirmed
  ASSIGNED --> EN_ROUTE: Departure acknowledged
  EN_ROUTE --> ON_SCENE: Arrival acknowledged
  ON_SCENE --> RESOLVED: Completion acknowledged and unit released
  RESOLVED --> [*]
```

```mermaid
sequenceDiagram
  actor R as Responder
  participant U as Responder console
  participant Q as IndexedDB and sync
  participant A as Status API
  participant D as PostgreSQL and audit
  R->>U: Advance cached assigned mission
  U->>Q: Persist desired status and action UUID
  Note over U,Q: Pending actions display locally while offline
  Q->>A: Replay in creation order when connected
  A->>D: Lock incident and check action UUID in workspace
  alt Matching replay
    A-->>Q: Return current committed incident
  else Valid new transition
    A->>D: Update state and record mission audit
    opt Status is RESOLVED
      A->>D: Release unit at incident node
    end
    D-->>A: Commit
    A-->>Q: Return acknowledged state
  else Invalid transition or conflicting UUID
    A-->>Q: Return conflict
  end
```

The responder browser queues milestones through the same outbox as practice SOS. Pending intent can advance the displayed mission before the API acknowledges it. The workspace-scoped lock on the incident and unique action IDs enforce order and deduplicate replay. A new action that requests the already current status returns the existing incident without another transition audit. A conflicting or out-of-order transition rolls back and is visible as a replay failure. Resolved releases the unit at the incident node. A coordinator and an authorized responder both have API permission to advance the assigned incident. [Responder console](../../frontend/src/pages/Responder.tsx) · [Mission transaction](../../backend/src/main/java/com/hydrogrid/store/IncidentStore.java) · [Offline responder browser test](../../e2e/tests/browser.spec.mjs)
