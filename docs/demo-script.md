# Two-minute HydroGrid demonstration

Use an isolated synthetic exercise throughout. Record in 16:10 at 1440 × 900 or in 16:9 with enough space to read the decision and audit views. The script works as narration or as a live talk track.

| Time | Screen and interaction | Narration |
| --- | --- | --- |
| 0:00–0:15 | Open the landing page and select **Start interactive demo**. Hold on the workspace dashboard. | “When mobile data drops, a flood report can stall before dispatch even sees it. HydroGrid is a browser-based disaster coordination prototype that follows the same practice report from the citizen’s device to a responder and a shelter.” |
| 0:15–0:30 | Show the **Command center** map, ranked incident list and connection state. Switch to **Citizen SOS** and choose the fictional Market Cross location. | “The exercise puts report priority, available units and passable routes in one workspace. There’s no sign-up to try it. Here’s a fictional report for three people at Market Cross.” |
| 0:30–0:52 | Go offline, select **Save SOS offline**, and show **Queued offline**. Reload while offline, then reconnect and show **Delivered**. | “The report is saved on this device. Even after a reload during an outage, it stays in the queue. When the connection returns, the server acknowledges the report and the delivery log changes to delivered.” |
| 0:52–1:16 | Open the report in **Command center**. Show triage reasons, the eligible unit and its accessible route. Confirm dispatch and open its mission. Mark en route and on scene. | “The coordinator sees why the report became critical, which available units meet its requirements, and the route on the simulated road network. The coordinator confirms dispatch. The responder records departure and arrival in the same exercise.” |
| 1:16–1:36 | Reserve three linked places in **Shelters** and record check-in. Finish the mission, then show **Analytics & audit**. | “A shelter can hold places and record admissions separately. The same incident connects the report, the unit and the shelter. The audit shows the decisions that were committed.” |
| 1:36–1:49 | Run seed **1337** in **Simulation lab** and hold on the comparison table. | “On this replay, HydroGrid served 14 of 14 critical incidents versus 13 for FIFO. Mean response rose from 33.72 to 34.16 simulated minutes. The repository includes all three seeds and mixed results.” |
| 1:49–2:00 | Show the landing page or competition evidence index. End on “Every SOS Counts.” | “Codex helped build, test and review the work. The eight-stage evidence pack links those decisions to reproducible checks. HydroGrid. Every SOS counts.” |

## Recording checklist

- Use a fresh, isolated exercise on the verified release. Let the app finish starting before the recording. Use a 1440 × 900 viewport or larger and leave the URL and personal browser profile out of frame.
- Use fictional values. Skip account enrollment, private field and agency sign-in, personal location sharing, and browser developer panels that reveal credentials. Show the practice label in the opening.
- Open **Citizen SOS** connected once before taking the browser offline. Include both **Queued offline** after reload and **Delivered** after reconnection. If using the in-app toggle, label that as an outage simulation.
- Keep the new report selected through the responder and shelter steps. Reserve places while the selected incident is open. Show the committed evidence after mission completion.
- Keep charts and event text readable for several seconds. State that seed 1337 is a simulated comparison and leave the response-time tradeoff visible.
- Review the exported file end to end, including the privacy checks above. Add the public video URL to the submission after uploading and verifying it in a signed-out browser.

[Interactive walkthrough](demo.md) · [Real application screenshots](showcase.md) · [Complete benchmark results](benchmarks.md)
