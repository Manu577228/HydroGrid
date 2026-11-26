# HydroGrid judge walkthrough

Open the live demo in a fresh browser tab while connected. Wait for the command center to show its sample incidents. This gives the browser time to save the app shell for the offline step. Use fictional values throughout. [Live demo](https://hydrogrid-demo-7v9f.onrender.com/) · [Local Docker setup](../README.md#run-the-demo) · [Judging evidence](judging.md)

## Four minutes

| Time | What to show | What proves it |
| --- | --- | --- |
| 0:00–0:55 | Open **Citizen SOS** and enable **Simulate offline**. Save an SOS and reload the page. Turn the simulation off, then open **Command center**. | The report stays queued after reload. Delivery is confirmed when the connection returns, and the report appears in the incident list. |
| 0:55–1:35 | In **Simulation lab**, find the flood route demonstration. Set the endpoints to **Market Cross** and **Canal Bridge**. Clear the flood, then apply **40%** shared map flood intensity. | The direct road closes and the route moves to two alternate segments. Clear the flood again before the dispatch step. |
| 1:35–2:35 | In **Command center**, select a report, inspect its priority and recommended unit, and dispatch the unit. In **Responder console**, mark the mission en route, on scene, and complete. Open **Shelters** to reserve spaces and record an admission. | One response moves from report to completion, and the shelter's available capacity reflects the reservation. |
| 2:35–4:00 | In **Simulation lab**, run seed **1337** with **100** incidents, **15** units, **40%** flood intensity, and **30%** network disruption. Play the scenario, then switch between **FIFO** and **HydroGrid**. | Both policies replay the same inputs. HydroGrid serves **14/14** critical incidents versus **13/14** for FIFO, with mean response rising from **33.72** to **34.16** simulated minutes. |

## For a follow-up question

- **What uses real data?** Open **Live Bengaluru**, choose two landmarks, then read the street snapshot date, weather model time, and Karnataka bulletin issue dates. For a private test, enter the access code on two devices and share one device's location. Watch the marker appear on the second device and disappear when sharing stops. [Hosted Bengaluru view](https://hydrogrid-demo-7v9f.onrender.com/#/live) · [Source and workspace details](../README.md#live-bengaluru)

- **Where is the proof for offline delivery?** The Playwright test disconnects the browser, reloads the page and checks that the server records one incident after reconnecting. [Browser test](../e2e/tests/browser.spec.mjs)
- **Why did the route move?** The flood polygon intersects road `R05`. PostGIS marks it closed and Dijkstra selects the open detour through `N11`. [Routing notes](engineering.md) · [Route test](../e2e/tests/api.spec.mjs)
- **What stops double assignments?** Dispatch and shelter reservations lock the records involved. The integration tests race two requests for one unit and two reservations for limited spaces. [Transaction tests](../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java)
- **Does one policy always win?** Seed `7` gives HydroGrid a lower mean response time and four more unserved incidents. Mean response covers served reports. Both policies use the same roads, unit fleet, report delays, and 120-minute simulated horizon. [Benchmark results](benchmarks.md)
