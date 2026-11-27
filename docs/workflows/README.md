# HydroGrid workflow diagrams

Follow a practice SOS from the browser outbox to an acknowledged report, a human-approved assignment, responder milestones and shelter admission. Use the simulation to compare two policies against the same synthetic workload. Public city information and opt-in device sharing have their own workflows and data boundaries. [Judge walkthrough](../demo.md) · [Verification](../testing.md)

| Workflow | What to inspect |
| --- | --- |
| [Citizen SOS lifecycle](reporting.md#citizen-sos-lifecycle) | Local save, authorized API submission, database commit, delivery receipt, and dashboard notification. |
| [Offline synchronization](reporting.md#offline-synchronization) | Stable operation IDs across reloads, replay, retry classes, and duplicate handling. |
| [Incident lifecycle](response.md#incident-lifecycle) | Persisted states, role checks, severity review, and unit release. |
| [Triage and prioritization](response.md#triage-and-prioritization) | Severity thresholds, bounded scoring, tie-breakers, and the coordinator override. |
| [Flood-aware routing](response.md#flood-aware-routing) | PostGIS closure checks, Dijkstra routing, and a synthetic detour. |
| [Rescue resource matching](response.md#rescue-resource-matching) | Equipment, reachability, capacity, ranking, and reasons for no match. |
| [Transactional dispatch](response.md#transactional-dispatch) | Revalidation under lock, concurrent attempts, and commit ordering. |
| [Responder mission lifecycle](response.md#responder-mission-lifecycle) | Ordered status changes with offline persistence, audit, and replay. |
| [Shelter coordination](coordination.md#shelter-coordination) | Reservation, admission, and capacity protection under contention. |
| [Real-time dashboard updates](coordination.md#real-time-dashboard-updates) | Commit-triggered STOMP invalidation, query reconciliation, and polling fallback. |
| [Authentication](identity.md) | Registration, login, restoration, refresh, logout, and isolated demo and field access. |
| [Simulation engine lifecycle](simulation.md) | Seeded generation, paired replay, metrics, and policy trade-offs. |
| [Live information and GPS](live-data.md) | Street snapshot, weather and bulletins, protected traffic data, device permissions, sharing, and expiration. |

The suite describes the [verified split release](../deployment.md#verified-split-release). Vercel serves the public app and forwards same-origin API calls to Render, which also serves the combined fallback. The practice exercise, citizen accounts, and private field and operator boards have separate access. The browser owns its practice workspace across reloads on the same origin. [API reference](../api.md) · [Security boundaries](../security.md)
