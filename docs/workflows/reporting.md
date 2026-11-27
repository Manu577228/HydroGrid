# Reporting and offline synchronization

## Citizen SOS lifecycle

The practice form collects a fictional hazard, a location from the exercise map, headcount, reported urgency and incident factors. Browser form constraints check required fields and ranges. If someone chooses to use device location, the browser uses the fix to suggest a nearby exercise node and sends that node's coordinates. The optional practice note stays in IndexedDB. Both connected and disconnected submissions write to the local outbox first. [SOS page](../../frontend/src/pages/Sos.tsx) · [Outbox](../../frontend/src/offline.ts)

```mermaid
sequenceDiagram
  actor C as Citizen
  participant UI as Practice SOS
  participant Q as IndexedDB outbox
  participant A as Spring API
  participant D as PostgreSQL and audit
  participant B as STOMP broker
  participant V as Coordinator dashboard
  C->>UI: Enter fictional report and submit
  UI->>UI: Check required fields and exercise location
  UI->>Q: Save report with stable client ID
  Q-->>UI: Local record written
  UI-->>C: Saved on this device
  alt Connected
    Q->>A: Replay with owned workspace token
    A->>A: Validate role and request
    A->>D: Save synthetic incident and SOS audit
    D-->>A: Commit
    A-->>Q: Return incident receipt
    Q-->>C: Delivery log shows Delivered
    A-->>B: Publish after commit
    B-->>V: Signal the scoped browser to refetch
  else Offline or connection simulated offline
    UI-->>C: Delivery log shows Queued offline
    Note over Q,A: Pending report waits for reconnect
  end
```

A local receipt means IndexedDB wrote the report. **Delivered** means the API returned a committed incident receipt and the browser updated the outbox. If the local write fails, the page shows an error. The API enforces its own DTO limits and exercise roles and snaps synthetic reports to the nearest exercise node. Retriable network and server failures leave delivery pending. Other rejected submissions can show **Needs attention** with an explicit retry. This workflow initiates a practice incident only. [Request and role checks](../../backend/src/main/java/com/hydrogrid/api/OperationsController.java) · [Transaction](../../backend/src/main/java/com/hydrogrid/store/IncidentStore.java) · [Browser verification](../../e2e/tests/browser.spec.mjs)

## Offline synchronization

```mermaid
sequenceDiagram
  actor C as Practice user
  participant UI as App shell and sync
  participant Q as IndexedDB
  participant A as Spring API
  participant D as PostgreSQL
  participant V as Coordinator
  Note over C,A: Network becomes unavailable
  C->>UI: Save synthetic SOS
  UI->>UI: Generate one client UUID
  UI->>Q: Persist action as pending
  C->>UI: Reload
  UI->>Q: Read pending action and original UUID
  Q-->>UI: Restore queue and local note
  Note over UI,A: Network returns
  loop Pending actions for current workspace in creation order
    UI->>A: Submit with original client UUID
    A->>D: Insert keyed by workspace and client UUID
    alt New report
      A->>D: Record SOS audit and commit transaction
      A-->>V: After-commit event via scoped STOMP
      A-->>UI: Return committed incident
      UI->>Q: Mark sent with server incident ID
    else Same key and matching normalized report
      D-->>A: Return stored incident
      A-->>UI: Return the existing incident without another event
      UI->>Q: Mark sent with the same incident ID
    else Temporary failure or lost acknowledgement
      A--xUI: No successful receipt
      UI->>Q: Keep action pending for replay
    else Rejected payload or conflicting ID reuse
      A-->>UI: Return validation or conflict error
      UI->>Q: Mark failed and retain record for review
    end
  end
```

Workbox precaches the app shell and bundled resources, while Dexie saves reports and mission actions. Replay runs on startup, connectivity changes, explicit retry, and a five-second interval when the app is active. Offline reload requires a previously cached shell. A lost API response can leave the report pending even if the server already committed it. Replay returns the existing incident with no second audit event. The client pauses the loop on network failure, authorization retry, a request timeout, throttling, or a server error. Other errors surface against the queued item.

Replay operates on the current workspace. An archived practice SOS can be explicitly sent in the current workspace, while an archived responder update stays with its original mission. Browser storage is origin-specific, so Vercel and the Render fallback can have separate practice workspaces and outboxes on the same device. [PWA configuration](../../frontend/vite.config.ts) · [Outbox replay](../../frontend/src/offline.ts) · [Storage constraints](../../backend/src/main/resources/db/migration/V1__hydrogrid.sql) · [Duplicate and offline tests](../../e2e/tests/api.spec.mjs)
