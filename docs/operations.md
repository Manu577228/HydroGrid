# Bengaluru city operations

[Open City operations](https://hydrogrid-demo-7v9f.onrender.com/#/operations) for official links and, if you are enrolled, the private board. This page uses separate permissions from HydroGrid's exercise and private GPS test.

| Capability | Verified source | Access needed for activation |
| --- | --- | --- |
| Road events and closures | Bengaluru Traffic Police publishes an open IUDX stream with an explicit closure flag, report ID, event time, revision time, and resolution state. [IUDX dataset](https://cos.iudx.org.in/iudx/cat/v1/item?id=0bb06335-09b0-4209-a2b0-d27953f301b3) · [Official ASTraM app](https://play.google.com/store/apps/details?id=com.BTPASTraM) | An email-verified IUDX Consumer and its client credentials. Check the current feed and applicable use terms with that account before any wider publication. |
| Measured surface flood depth | KSNDMC's sensors and the Bengaluru Integrated Command and Control Centre exchange telemetry. KSNDMC's public app publishes citizen advisories and weather information. [Karnataka flood plan](https://revenue.karnataka.gov.in/uploads/media_to_upload1712739726.pdf) · [ICCC](https://iccc.niua.org/icc/city-details/f93b8bbbac89ea22bac0bf188ba49a61) · [Bengaluru Megha Sandesha](https://play.google.com/store/apps/details?id=com.moserptech.meghasandesha) | Ask KSNDMC and Bengaluru ICCC for station IDs, coordinates, units, datum, timestamp, quality and health flags, and permitted use. A drain water level needs a separately validated conversion before it can represent street depth. Authorized field staff can record a sourced measurement on the board. |
| Shelter occupancy | Bengaluru Urban's District Disaster Management Authority coordinates district response. [DDMA](https://bengaluruurban.nic.in/en/departments/disaster-management/) | Ask DDMA for the active facility roster and publication policy. Enroll operators who can confirm the current opening state, capacity, occupancy, and observation time. |
| Emergency response | 112 connects callers with the state's Public Safety Answering Point. [MHA ERSS](https://www.mha.gov.in/emergency-response-support-system-erss) · [ERSS 2.0 guidelines](https://www.mha.gov.in/files/inline-documents/GuidelinesERSS20_03112026.pdf) | The Karnataka PSAP and its designated technical provider must supply an approved test environment, interface credentials, and receipt semantics for a dispatch integration. HydroGrid currently links callers to 112. Authorized humans can use the private log to record an existing handoff and its confirmed acknowledgement or closure. |

## Connect the IUDX traffic feed

1. Sign in from the [IUDX catalogue](https://catalogue.iudx.org.in/), register, verify the account email, and select the Consumer role. Obtain client credentials from the IUDX profile. [Registration](https://docs.iudx.org.in/docs/registration/) · [Client credentials](https://docs.iudx.org.in/docs/client-credentials/)
2. Set `HYDROGRID_IUDX_CLIENT_ID` and `HYDROGRID_IUDX_CLIENT_SECRET` in the server environment and redeploy. Add them to the shell environment for a local Compose test. Keep them in the provider's secret store.
3. Enroll a `TRAFFIC_VIEWER` to review road events only, or a `TRAFFIC` operator to review events and record authorized road observations. A `COORDINATOR` also has access. Confirm the data checked time and the time on the actual provider event. The board retrieves up to 25 recent rows from a two-hour window and keeps the newest revision for a report ID. Unavailable and empty results give no assurance about an individual road.

During the authenticated source check on 27 November 2026 (IST), the current two-hour query returned no events. The newest observation in the resource’s latest payload was on 2 February 2026 (IST). Confirm reporting cadence with the provider before relying on current event coverage.

The server uses the IUDX token API and fixed Bengaluru traffic resource. Provider records stay in memory and are presented as recent reports. The feed does not change the OpenStreetMap route calculation. [Token documentation](https://docs.iudx.org.in/docs/consumer/consumer_obtaining_access_token/) · [Resource queries](https://docs.iudx.org.in/docs/consumer/consumer_data_access_apis/)

## Enroll and revoke workspace access

A deployment starts with operator access disabled. For a controlled deployment, use `HYDROGRID_OPERATOR_ACCOUNTS` to list authorized accounts in the following format.

```text
operator-id:SCOPE:SHA256_OF_ACCESS_CODE,second-operator:SCOPE:SHA256_OF_ACCESS_CODE
```

Generate a distinct code for each person using at least 32 random bytes, for example `openssl rand -hex 32`. Send each code to its assigned person through the organization's approved credential channel. Store only the exact UTF-8 SHA-256 hexadecimal digest in the environment entry. Operator IDs support lowercase letters, digits, '.', '_' and '-'. Use the narrowest applicable scope.

| Scope | Access |
| --- | --- |
| `TRAFFIC_VIEWER` | Read the authenticated IUDX road events only. |
| `FLOOD`, `TRAFFIC`, `SHELTER` | Read operator observations and record updates for the assigned domain. Traffic operators can also see the IUDX feed. |
| `DISPATCH` | Read observations and record external handoff events and references. |
| `COORDINATOR` | Read the whole board and use all operator forms. |

Sessions last four hours. Rotate the code digest, change the scope, or remove the account and redeploy to invalidate existing sessions. Before enrolling actual agency operators, establish the ownership of the workspace and approval for all roles to share site observations. The public demo and GPS test issue separate roles.

## Record and verify an observation

Use the agency's site ID so a newer update supersedes the previous reading at the same site. Enter a named measurement point, coordinates, time in IST, and the corresponding agency reference. Enter surface water depth in centimetres, a confirmed road closure or reopening, or shelter opening state with operational headcount and capacity. Shelter counts are whole people. Each entry carries the author and source and expires after 30 minutes for flood, 120 minutes for traffic, or 60 minutes for shelter occupancy. The board shows expired records as stale. Exact retries return the original receipt and older observations cannot replace the current record.

The board shows at most 100 current sites per domain and 100 handoffs. Superseded observation revisions and closed handoffs are retained for 30 days according to scheduled cleanup. Current site records and open handoffs are retained. Enter agency reference IDs without personal details.

## Record a confirmed handoff

After calling or alerting the authorized responder through the agency's established channel, use the issued reference to log the handoff. Record acknowledgement and closure after confirmation through that channel. These actions update the private log. In an emergency, call [112](tel:112).
