# HydroGrid API reference

The base URL for these examples is `http://127.0.0.1:8080` on an isolated local instance. Requests with a JSON body use `Content-Type: application/json`. IDs are UUIDs unless stated otherwise. Use the IDs returned by your current exercise. JSON examples below omit unrelated fields and use <code>&lt;token&gt;</code> and <code>&lt;id&gt;</code> as placeholders.

Protected REST calls use `Authorization: Bearer <token>`. The API responds with 401 for missing or invalid credentials and 403 for the wrong role or scope. Malformed query parameters, IDs, or request bodies return 400. Scoped records outside the exercise return 404 when addressed by ID. State conflicts or reused client IDs with incompatible payloads return 409. Use the response status for control flow. A problem response can also include a human-readable detail.

## Public and exercise access

| Request | Authorization and validation | Example response or error |
| --- | --- | --- |
| `GET /api/health` | Public. Checks that the database and expected seeded graph are responsive. | `200 {"status":"UP","synthetic":true}` or `503 {"status":"DOWN","synthetic":true}`. |
| `GET /api/graph` | Public returns the base synthetic graph. An owned exercise bearer adds its hazard state. | `200 {"nodes":[...],"roads":[...],"hazards":[],"floodZones":[...],"blockedRoadIds":[],"intensity":0}`. |
| `POST /api/auth/demo` with `{"role":"COORDINATOR"}` | Public entry to a synthetic exercise only. Include `X-Demo-Session` (UUID) and `X-Demo-Owner` (64 lowercase hex characters). Role is `COORDINATOR`, `RESPONDER`, `SHELTER` or `CITIZEN`. The same proof is required to reuse a workspace. | `200 {"token":"<token>","role":"COORDINATOR"}`. The JWT lasts two hours. 403 for a proof mismatch and 404 when disabled. |
| `GET /api/live/alerts` | Public. Provider and area are fixed to NDMA Karnataka. | `200 {"source":"...","sourceUrl":"...","scope":"...","status":"...","checkedAt":"...","items":[...]}`. Each item includes ID, title, category, issuer, published timestamp and official link. Inspect status and age before using retained bulletins. |
| `GET /geography/bengaluru-v1.json` | Public static resource. OpenStreetMap snapshot and provenance. | `200 {"bounds":[...],"landmarks":[...],"source":{...},"roads":[...],"vertices":[...],"edges":[...],"forbiddenTurns":[...]}`. |

A disposable coordinator credential for reproducing API examples locally. Generate one session and one proof, then reuse them to mint different exercise roles for the same fixture.

```sh
session=$(uuidgen | tr '[:upper:]' '[:lower:]')
owner=$(openssl rand -hex 32)
curl --fail --silent --show-error http://127.0.0.1:8080/api/auth/demo \
  -H "X-Demo-Session: $session" -H "X-Demo-Owner: $owner" \
  -H 'Content-Type: application/json' -d '{"role":"COORDINATOR"}'
```

## Incidents, units and missions

Role abbreviations below are `C` coordinator, `R` responder, `S` shelter and `P` practice citizen. Each requires an owned exercise JWT. A real citizen account uses a different role.

| Request | Role and validation | Example response or error |
| --- | --- | --- |
| `GET /api/incidents` | C, R or S. The responder list returns assigned records only. | `200 [{"id":"<id>","severity":"HIGH","status":"ASSIGNED","nodeId":"N09",...}]`. |
| `POST /api/incidents` with the example body below | P or C. Client UUID and hazard are required, summary 1–160, headcount 1–200, depth 0–500 cm, valid latitude and longitude. Optional reported severity is `LOW`, `MEDIUM`, `HIGH` or `CRITICAL`. Hazard is `FLOOD`, `MEDICAL`, `LANDSLIDE`, `INFRASTRUCTURE` or `OTHER`. | `200 {"id":"<id>","clientId":"<id>","status":"REPORTED","severity":"HIGH","score":...,"reasons":[...]}`. Same normalized payload returns the original record. Conflicting reuse returns 409. |
| `GET /api/units` | C or R. Workspace units only. | `200 [{"id":"<id>","name":"Rapid 01","nodeId":"N05","capacity":8,"equipment":["BOAT","MEDICAL"],"status":"BUSY",...}]`. |
| `GET /api/incidents/<id>/recommendations` | C. Checks equipment, capacity and reachability for an open report. | `200 {"candidates":[{"unitId":"<id>","route":{...},"spareCapacity":2,"rank":6.2}],"multiUnitRequired":false,"reason":"..."}`. |
| `POST /api/incidents/<id>/dispatch` with `{}` or `{"unitId":"<id>"}` | C. An omitted unit lets the matcher select an eligible unit. | `200 {"id":"<id>","status":"ASSIGNED","assignedUnitId":"<id>",...}` or 409 if eligibility or assignment state no longer allows it. |
| `POST /api/incidents/<id>/status` with `{"clientId":"<id>","status":"EN_ROUTE"}` | R or C. Client UUID required. Use `EN_ROUTE`, `ON_SCENE`, `RESOLVED` in that sequence after dispatch. | `200 {"id":"<id>","status":"EN_ROUTE",...}`. Replays return current incident state. A skipped transition or divergent reuse returns 409. |
| `POST /api/incidents/<id>/triage` with `{"severity":"HIGH","reason":"Updated exercise details"}` | C. Nonblank reason up to 240 characters. The synthetic environment normalizes unrecognized reason text before storing it. | `200 {"id":"<id>","severity":"HIGH","reasons":[...],...}` or 409 for a resolved incident. |
| `GET /api/incidents/<id>/timeline` | R or C. Scoped to one incident. | `200 [{"id":"<id>","incidentId":"<id>","type":"UNIT_DISPATCHED","detail":"...","createdAt":"..."}]` in ascending time. |
| `GET /api/audit` | C. Up to 250 recent committed exercise events. | `200 [{"id":"<id>","type":"MISSION_ON_SCENE",...}]`, newest first. |
| `GET /api/clusters` | C. Candidates are open, ungrouped, same-hazard reports within 750 m and 45 minutes. | `200 [{"incidentIds":["<id>","<id>"],"distanceMeters":350}]`. |
| `POST /api/clusters` with `{"incidentIds":["<id>","<id>"]}` | C. Select 2–20 distinct reports that are linked by candidate proximity. | `200 {"groupId":"<id>"}`, 404 for an inaccessible report or 409 for an invalid group. |

```json
{
  "clientId": "2f3b83cc-86cc-4f75-a066-856f8815fc31",
  "summary": "Practice flood report",
  "hazard": "FLOOD",
  "people": 3,
  "medical": false,
  "vulnerable": true,
  "depthCm": 70,
  "immediateDanger": false,
  "lat": 12.98,
  "lng": 77.60
}
```

The hosted exercise normalizes summary text and snaps the position to the seeded graph. The practice UI sends predefined context and stores its optional free-text note only on the device. [Privacy boundaries](security.md)

## Routing, shelters and simulation

| Request | Role and validation | Example response or error |
| --- | --- | --- |
| `GET /api/routes?from=N01&to=N02` | C, R or S. Both IDs must exist in the synthetic graph, or 400. | `200 {"reachable":false,"nodeIds":[],"roadIds":[],"path":[],"distanceKm":0,"travelMinutes":0}` for no open path. Reachable routes populate those fields. |
| `POST /api/hazards` with `{"intensity":40}` | C. Intensity is 0–100. Changes the synthetic graph for this workspace. | `200 {"intensity":40,"blockedRoadIds":[...],"hazards":[...],...}`. |
| `GET /api/shelters` | C, R or S. Workspace shelter records only. | `200 [{"id":"<id>","name":"Central Relief Hub","capacity":80,"reserved":0,"admitted":31,"available":49,...}]`. |
| `GET /api/shelters/recommendations?incidentId=<id>` | C, R or S. Uses headcount, medical suitability and current route availability. | `200 [{"shelter":{"id":"<id>",...},"route":{"reachable":true,...}}]`. |
| `GET /api/shelters/<id>/reservations` | C or S. A shelter must exist in the exercise. | `200 [{"id":"<id>","shelterId":"<id>","incidentId":null,"people":3,"status":"RESERVED"}]`. |
| `POST /api/shelters/<id>/reservations` with `{"clientId":"<id>","people":3}` | C or S. Client ID required, 1–200 people, optional in-scope `incidentId`. | `200 {"id":"<id>","shelterId":"<id>","incidentId":null,"people":3,"status":"RESERVED"}`. Capacity and conflicting retries return 409. |
| `POST /api/shelters/<id>/reservations/<id>/admit` | C or S. No request body needed. The reservation must belong to that shelter. | `200 {"id":"<id>","people":3,"status":"ADMITTED",...}`. Repeat admission returns the current record. |
| `POST /api/simulation` with `{"seed":42,"incidents":100,"units":15,"floodIntensity":40,"networkDisruption":30}` | C. Requires seed, 1–250 incidents, 1–40 units and 0–100 for both percentages. | `200 {"scenario":{...},"summary":{"horizonMinutes":120,...},"baseline":{...},"hydroGrid":{...},"incidents":[...],"units":[...],"baselineDispatches":[...],"hydroGridDispatches":[...]}`. |

## Exercise dashboard

| Request | Role and validation | Example response or error |
| --- | --- | --- |
| `GET /api/dashboard?hours=6` | C. Defaults to 6 and accepts 1, 6, 24 or 48 hours. Time buckets align to Bengaluru. | `200 {"generatedAt":"...","since":"...","bucketSeconds":1800,"summary":{...},"activity":[...],"response":[...],"severity":[...],"categories":[...],"lifecycle":[...],"hourly":[...],"units":[...],"shelters":[...],"recent":[...],"critical":[...],"mapIncidents":[...]}`. |
| `GET /api/dashboard/incidents?page=1&severity=HIGH&sort=NEWEST` | C. Positive `page`, optional `q` up to 100 characters, and optional `severity`, `hazard`, `status`, ISO-8601 `start` and `end` with at most a seven-day interval. Sort accepts `PRIORITY`, `NEWEST`, `OLDEST` and `PEOPLE`. | `200 {"items":[...],"total":1,"page":1,"pages":1}`. Each page carries at most 20 records. |
| `GET /api/dashboard/incidents/<id>` | C. Exercise-scoped detail. | `200 {"id":"<id>","severity":"HIGH","status":"REPORTED","reasons":[...],...}` or 404 for a record outside the workspace. |

## Citizen accounts

Account mutations require the exact `Origin` of the app, HTTPS outside loopback, and a same-origin `Sec-Fetch-Site` when present. Account POST bodies and profile PATCH use JSON. Refresh and logout can send an empty JSON body. Successful auth returns a 10-minute access token and, where applicable, a rotating `hydrogrid-account-refresh` cookie scoped to `/api/account`.

| Request | Authorization and validation | Example response or error |
| --- | --- | --- |
| `POST /api/account/register` with `{"email":"citizen@example.test","displayName":"QA Citizen","password":"local-example-password"}` | Public same-origin entry. Email up to 254, nonblank name up to 80, password from 12 characters to 72 UTF-8 bytes. | `201 {"token":"<token>","expiresAt":"...","profile":{"id":"<id>","displayName":"QA Citizen","email":"citizen@example.test","timeZone":"Asia/Kolkata","createdAt":"...","role":"CITIZEN"}}`. Duplicate email returns 409 and throttling returns 429. |
| `POST /api/account/login` with `{"email":"citizen@example.test","password":"local-example-password"}` | Public same-origin entry. Requires email and a password up to 72 UTF-8 bytes. | `200` with the auth response above. Invalid credentials return 401. Throttling returns 429. |
| `POST /api/account/refresh` with `{}` and the cookie | Same-origin request. Rotates a valid refresh token without extending the original session deadline. | `200` with fresh auth response, 204 without a cookie, 401 for invalid/expired/replayed cookie, or 429 when throttled. |
| `POST /api/account/logout` with `{}` and the cookie | Same-origin request. Revokes the matching session and clears the cookie. | `204`. |
| `GET /api/account/profile` | Citizen account JWT with an active server-side session. | `200 {"id":"<id>","displayName":"QA Citizen","email":"citizen@example.test","timeZone":"Asia/Kolkata","createdAt":"...","role":"CITIZEN"}`. |
| `PATCH /api/account/profile` with `{"displayName":"QA Citizen","timeZone":"UTC"}` | Same-origin citizen account JWT and active session. Nonblank name to 80 characters and a Java-recognized IANA time zone. | `200` with updated profile. Unsupported time zone returns 400. |

## Private field and agency scopes

Use an isolated local fixture to reproduce mutations below. Setup and enrollment live in [local setup](setup.md) and [operations](operations.md). Operations event data and statuses carry source and freshness context.

| Request | Authorization and validation | Example response or error |
| --- | --- | --- |
| `GET /api/field/status` | Public capability flag. | `200 {"available":false}` without private field configuration. |
| `POST /api/field/access` with `{"code":"<local-fixture-code>"}` | Nonblank code up to 256 characters. Correct configured code required. | `200 {"token":"<token>"}`; private FIELD JWT lasts eight hours. Wrong code returns 401 and unavailable configuration returns 503. |
| `GET /api/field/board` | FIELD token with current code version. Shared private positions from five minutes and reports from 24 hours, each limited to 100. | `200 {"deviceId":"<id>","positions":[...],"reports":[...]}`. |
| `POST /api/field/location` with `{"label":"Local QA device","lat":12.98,"lng":77.60,"accuracy":20}` | FIELD. Nonblank label to 40 characters, valid coordinates and accuracy 0–100000 m. | `204`. Stores the latest fix for that token's device. |
| `DELETE /api/field/location` | FIELD. Deletes the position for that device. | `204`. |
| `POST /api/field/reports` with `{"clientId":"<id>","lat":12.98,"lng":77.60,"accuracy":20,"note":"Local QA test"}` | FIELD. Client ID required. Same fix validation and nonblank note to 280 characters. | `200 {"id":"<id>","lat":12.98,"lng":77.60,"accuracy":20,"note":"Local QA test","createdAt":"..."}`. Same device and client UUID return the first record. |
| `GET /api/ops/status` | Public capability flag. | `200 {"available":true}` when operators are configured. |
| `POST /api/ops/access` with `{"operator":"qa-operator","code":"<local-fixture-code>"}` | Known operator ID and 32–256 character code. | `200 {"token":"<token>"}`; OPS token lasts four hours. Unknown/incorrect credentials return 401 or disabled service returns 503. |
| `GET /api/ops/board` | OPS with a current enrollment. Traffic-view scope receives empty board observations. Dispatch-capable scopes can read handoffs. | `200 {"operator":"qa-operator","scope":"COORDINATOR","observations":[...],"handoffs":[...]}`. |
| `GET /api/ops/traffic-feed` | OPS with `TRAFFIC_VIEWER`, `TRAFFIC` or `COORDINATOR`. Last two hours queried and provider revisions deduplicated. | `200 {"status":"...","checkedAt":"...","since":"...","events":[...]}`. Events have ID, title, observed and end time, closure flag and resolution. |
| `POST /api/ops/observations` with the example below | OPS with matching domain or coordinator. Bengaluru coordinates and observation timestamp from 24 hours ago through 2 minutes ahead. Flood uses 0–2000 cm, traffic uses `OPEN` or `CLOSED`, and shelter uses state and whole occupancy/capacity to 100000. | `200 {"kind":"FLOOD","siteId":"qa-depth","value":24.0,"reportedBy":"qa-operator","expiresAt":"...",...}`. An older or conflicting revision returns 409. |
| `POST /api/ops/handoffs` with `{"id":"<id>","reference":"QA-EXTERNAL-01","expectedState":null,"state":"RELAYED"}` | OPS with `DISPATCH` or `COORDINATOR`. A non-personal reference of at most 80 characters. State progresses to `ACKNOWLEDGED` then `CLOSED`, passing the prior state. | `200 {"id":"<id>","reference":"QA-EXTERNAL-01","state":"RELAYED","updatedAt":"...","reportedBy":"qa-operator"}`. Invalid transitions return 400 and conflicts return 409. |

Replace `observedAt` with a current fixture time.

```json
{
  "kind": "FLOOD",
  "siteId": "qa-depth",
  "label": "QA depth point",
  "lat": 12.98,
  "lng": 77.60,
  "observedAt": "2026-11-27T09:00:00+05:30",
  "sourceRef": "qa-reading-01",
  "value": 24
}
```

## WebSocket and STOMP

Connect to `wss://<host>/ws` for the HTTPS public app or `ws://127.0.0.1:8080/ws` for local Compose. Send `Authorization: Bearer <exercise-token>` as a native STOMP CONNECT header, then SUBSCRIBE to exactly `/topic/updates/<exercise-session-uuid>`. The token must carry the owned workspace claim and be unexpired. Server messages contain `{"id":"<id>","type":"SOS_REPORTED","entityId":"<id>"}` after commit. A hazard change has a null entity ID.

Other subscriptions and STOMP SEND are rejected. Mutations remain on the role-protected REST surface. Reconnect and re-read REST state after disruption. [Socket authorization and invalidation](engineering.md#offline-and-real-time-reconciliation)
