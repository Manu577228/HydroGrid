# Shelter and dashboard coordination

## Shelter coordination

```mermaid
sequenceDiagram
  actor H1 as Shelter operator
  actor H2 as Concurrent request
  participant A as Shelter API
  participant D as PostgreSQL and audit
  participant B as Dashboard browser
  H1->>A: Select shelter and reserve places
  A->>D: Lock workspace shelter row and read capacity
  H2->>A: Request the same remaining places
  A->>D: Competing reservation waits on the same row
  A->>D: Validate available places and save reservation
  A->>D: Increment reserved count and write audit
  D-->>A: Commit first reservation
  A-->>H1: Return RESERVED receipt
  A-->>B: Publish shelter change after commit
  D-->>A: Second request sees current capacity
  A-->>H2: Conflict if places no longer fit
  H1->>A: Check in the reservation
  A->>D: Lock shelter and read scoped reservation
  A->>D: Move people from reserved to admitted and write audit
  D-->>A: Commit admission
  A-->>H1: Return ADMITTED receipt
  A-->>B: Publish change and trigger query refresh
```

The API permits exercise Shelter and Coordinator roles. Recommendations use incident headcount, shelter type for a medical case, current available places, and reachability. A reservation independently validates the requested headcount and any linked workspace incident. It increases reserved occupancy. Admission subtracts the same group from reserved and adds it to admitted. **Available = capacity − reserved − admitted**, so availability falls when reserved, then stays the same when that group is checked in.

The shelter-row lock guards both mutations. A competing request waits and checks the reduced capacity after the first transaction commits. PostgreSQL also constrains the sum of reserved and admitted to capacity. Matching request IDs return the previous reservation, conflicting ID reuse fails, and repeated admission returns the already-admitted record. The workflow manages seeded exercise places. Authorized real facility observations use the separate operator board. [Shelter store](../../backend/src/main/java/com/hydrogrid/store/ShelterStore.java) · [Database constraints](../../backend/src/main/resources/db/migration/V1__hydrogrid.sql) · [Reservation race test](../../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java) · [Operator board](../operations.md)

## Real-time dashboard updates

```mermaid
sequenceDiagram
  actor U as Exercise participant
  participant API as Spring API
  participant DB as PostgreSQL
  participant S as Render STOMP broker
  participant C as Coordinator browser
  C->>S: Connect with owned session JWT and subscribe to exact exercise topic
  S->>S: Validate token, workspace and lease
  U->>API: Report, dispatch, mission, hazard or shelter action
  API->>DB: Save scoped state and audit where applicable
  DB-->>API: Commit
  API->>S: Publish event for this exercise
  alt Authorized socket with active lease
    S-->>C: Deliver event ID and affected entity
    C->>C: Deduplicate ID and invalidate exercise queries
    C->>API: Refetch authorized dashboard and views
    API-->>C: Return committed state
    C->>C: Update charts, counts and timeline
  else Connection drops
    C->>C: Schedule reconnect with backoff
    loop While visible and online without a socket
      C->>API: Refresh exercise queries every 20 seconds
    end
    C->>S: Reauthorize and resubscribe
    C->>API: Refresh on successful reconnect
  end
```

The Vercel browser connects directly to Render over WSS for STOMP. The Render fallback uses its same-origin socket. The exact allowed frontend origin protects the cross-origin handshake, and the STOMP interceptor validates the token and permits subscriptions only to the token's workspace. Clients send mutations through REST. They keep a rolling set of 100 event IDs and treat each accepted message as a signal to fetch authoritative state. Publishing happens after transaction commit. The dashboard reads its aggregates in a repeatable-read transaction. The broker runs in the backend process and disconnected clients reconcile via REST. It has no durable replay. [STOMP authorization](../../backend/src/main/java/com/hydrogrid/config/WebSocketConfiguration.java) · [After-commit listener](../../backend/src/main/java/com/hydrogrid/config/LiveUpdates.java) · [Browser connection](../../frontend/src/api.ts) · [Polling fallback](../../frontend/src/network.tsx) · [Dashboard queries](../../backend/src/main/java/com/hydrogrid/api/DashboardController.java)
