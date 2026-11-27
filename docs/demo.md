# HydroGrid judge walkthrough

Open the guest exercise in a fresh browser profile or private window while connected. Keep the same tab through dispatch, response and shelter admission so every page uses the same workspace. All incidents, units, exercise roads and shelter figures are fictional. A cold Render start can add about a minute before the walkthrough begins. [Hosted demo](https://hydrogrid-demo-7v9f.onrender.com/) · [Local setup](setup.md) · [Product gallery](showcase.md)

## Experience HydroGrid in 90 Seconds

| From app ready | Do this | What to look for |
| --- | --- | --- |
| 0:00 | Select **Start interactive demo** and open **Citizen SOS**. Leave **Market Cross** and 3 people selected. Enter 90 cm of water and check **Immediate danger**. | The exercise opens without an account, device GPS or personal details. |
| 0:20 | In the **Connection** card, select **Simulate offline**, then **Save SOS offline**. Once the log shows **Queued offline**, turn **Simulate offline** off. | The delivery log changes to **Delivered** after the server acknowledges the report. |
| 0:40 | Open **Command center** and select **Flood rescue request**. Click **Review selected report**, inspect the priority and accessible route, then choose **Dispatch unit** and **Confirm dispatch**. | The report is critical. Score contributions include reported water depth and people affected. The route displays the selected unit’s simulated travel time. |
| 1:10 | Choose **Open this mission**, then **Mark en route** and **Mark on scene**. Open **Analytics & audit** to see the committed events. | The same incident appears in the field and audit views. |

The 90-second path assumes a warm app and a connected browser with JavaScript and storage available. The fuller demonstration below includes finishing the mission, check-in and a comparison of policies.

## Follow the report through the whole exercise

1. **Prove the outage flow.** Open **Citizen SOS** while connected to prime the app shell. Use the in-app offline toggle, save the report, reload, then reconnect. To evaluate a real browser network outage, run the Playwright browser test, which explicitly takes Chromium offline and checks that only one server incident is created. [Browser tests](../e2e/tests/browser.spec.mjs)
2. **Prove the flood detour.** In **Simulation lab**, select **Flood route demonstration**. Choose **Market Cross** and **Canal Bridge**, then **Clear flood**. Apply **40%** shared map flood intensity. Road R05 closes and the route moves to two alternate segments through N11. Clear the flood before dispatching. [Routing and concurrency API tests](../e2e/tests/api.spec.mjs)
3. **Confirm dispatch and track the response.** In **Command center**, inspect the new report’s priority reasons, equipment, spare places and route. Confirm the assignment and use **Open this mission**. Mark the unit en route and on scene. Keep the mission open while reserving space.
4. **Reserve and admit.** In **Shelters**, choose a shelter with available places and select **Reserve spaces**. Link **Flood rescue request · N06** and reserve its three places. Choose **Check in**. The reservation becomes an admission while available space is unchanged from the post-reservation count. Return to that mission and select **Complete mission**. The audit records dispatch, mission and shelter events together. [Shelter transaction tests](../backend/src/test/java/com/hydrogrid/HydroGridIntegrationTest.java)
5. **Compare policies.** Run **Simulation lab** with seed 1337, 100 reports, 15 units, 40% flood intensity and 30% chance of delayed reporting. Switch **Playback strategy** between FIFO and HydroGrid. Critical service changes from 13/14 to 14/14, while mean response rises from 33.72 to 34.16 simulated minutes. Export JSON or rerun all three published seeds. [Benchmark results](benchmarks.md)

## Inspect the sourced Bengaluru view

Choose two landmarks in **Live Bengaluru**. Inspect the OpenStreetMap snapshot date, Open-Meteo model timestamp and original Karnataka bulletin issue dates before interpreting them. The bounded street preview excludes closure and flood status. The public competition exercise requires no private field code, real GPS, or agency operator login. HydroGrid is a prototype. In India, use the official 112 service for emergencies. [Live Bengaluru](https://hydrogrid-demo-7v9f.onrender.com/#/live) · [Data sources and terms](attribution.md) · [Official 112 service](https://www.mha.gov.in/emergency-response-support-system-erss)

[Two-minute narration and recording storyboard](demo-script.md) · [Competition evidence](judging.md)
