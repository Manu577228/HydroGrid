# HydroGrid judge walkthrough

## Four minutes

1. **Start with the problem.** A disaster coordinator has incomplete information, changing road access, and too few responders. Open HydroGrid's command center and point out the priority queue and the synthetic road network.
2. **Show resilience.** In the connection menu, enable Simulate offline. Submit a fictional report from Citizen SOS and show it waiting in the delivery log. Reload the page and show the pending entry again. Disable Simulate offline. After the receipt appears, open the command center and find the new report.
3. **Show an operational decision.** Open an incident and inspect equipment, capacity, and route fit. Dispatch a recommended unit. In the responder console, advance it from en route to on scene and then resolved. In Shelters, reserve suitable capacity and record the admission.
4. **Show the experiment.** Run the simulation with seed **1337**, **100** incidents, **15** units, **40%** flood intensity, and **30%** network disruption. Compare the critical service rate and average response time. Repeat with seed **42** and explain why outcomes vary with the scenario. Point judges to the audit history.

### Route proof

In the synthetic graph, the direct route from **Market Cross (N06)** to **Canal Bridge (N07)** is road `R05`. At 40% intensity, a flood polygon intersects that segment. PostGIS supplies the blocked road IDs to Dijkstra, which takes a longer reachable route. The Playwright route test demonstrates this exact comparison through the deployed API.

### Points to make accurately

- The service worker makes the previously loaded app available offline. IndexedDB retains pending actions across reloads. The server confirms delivery after connectivity returns.
- Both strategies use the same incidents, report delays, closures, units, and 120-minute replay horizon. The numbers describe synthetic runs only.
- Dispatch and shelter reservation decisions use database transactions. Replaying a queued action with the same client-generated ID keeps one server record.
