import { randomBytes, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const ownerKeys = new Map();

async function apiRole(request, session, role) {
  if (!ownerKeys.has(session)) ownerKeys.set(session, randomBytes(32).toString('hex'));
  const login = await request.post('/api/auth/demo', {
    headers: { 'X-Demo-Session': session, 'X-Demo-Owner': ownerKeys.get(session) },
    data: { role },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  return {
    token,
    get: (path) => request.get(path, { headers }),
    post: (path, data) => request.post(path, { headers, data }),
  };
}

function sampleIncident() {
  return {
    clientId: randomUUID(),
    summary: 'Flood rescue requested',
    hazard: 'FLOOD',
    people: 2,
    medical: true,
    vulnerable: true,
    depthCm: 42,
    immediateDanger: true,
    lat: 12.9876,
    lng: 77.6000,
  };
}

test('SOS replay is idempotent and demo workspaces stay isolated', async ({ request }) => {
  const session = randomUUID();
  const citizen = await apiRole(request, session, 'CITIZEN');
  const coordinator = await apiRole(request, session, 'COORDINATOR');
  const otherWorkspace = await apiRole(request, randomUUID(), 'COORDINATOR');
  const initial = await coordinator.get('/api/incidents');
  expect(initial.ok()).toBeTruthy();
  const originalSize = (await initial.json()).length;

  const payload = sampleIncident();
  const first = await citizen.post('/api/incidents', payload);
  const retry = await citizen.post('/api/incidents', payload);
  expect(first.ok()).toBeTruthy();
  expect(retry.ok()).toBeTruthy();
  const incident = await first.json();
  expect((await retry.json()).id).toBe(incident.id);

  const current = await (await coordinator.get('/api/incidents')).json();
  expect(current).toHaveLength(originalSize + 1);
  expect(current.filter((row) => row.id === incident.id)).toHaveLength(1);
  expect((await citizen.post(`/api/incidents/${incident.id}/dispatch`, {})).status()).toBe(403);
  const isolated = await (await otherWorkspace.get('/api/incidents')).json();
  expect(isolated.some((row) => row.id === incident.id)).toBe(false);
});

test('a fixed seed returns the same replay and accounts for every report', async ({ request }) => {
  const coordinator = await apiRole(request, randomUUID(), 'COORDINATOR');
  const scenario = { seed: 42, incidents: 100, units: 15, floodIntensity: 40, networkDisruption: 30 };
  const simulate = () => coordinator.post('/api/simulation', scenario);
  const first = await simulate();
  const second = await simulate();
  expect(first.ok(), await first.text()).toBeTruthy();
  expect(second.ok()).toBeTruthy();
  const replay = await first.json();
  expect(await second.json()).toEqual(replay);
  expect(replay.incidents).toHaveLength(100);
  expect(replay.units).toHaveLength(15);
  expect(replay.summary.offlineReports).toBeGreaterThan(0);
  for (const metrics of [replay.baseline, replay.hydroGrid]) {
    expect(metrics.criticalServedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.criticalServedPercent).toBeLessThanOrEqual(100);
    expect(metrics.servedIncidents + metrics.unservedIncidents).toBe(scenario.incidents);
  }
});

test('a flood polygon closes the direct road and a detour avoids every blocked road', async ({ request }) => {
  const coordinator = await apiRole(request, randomUUID(), 'COORDINATOR');
  const route = () => coordinator.get('/api/routes?from=N06&to=N07');
  expect((await coordinator.post('/api/hazards', { intensity: 0 })).ok()).toBeTruthy();
  const dry = await (await route()).json();
  expect(dry.reachable).toBe(true);
  expect(dry.roadIds).toEqual(['R05']);

  const change = await coordinator.post('/api/hazards', { intensity: 40 });
  expect(change.ok()).toBeTruthy();
  const { blockedRoadIds } = await change.json();
  expect(blockedRoadIds).toContain('R05');
  const wet = await (await route()).json();
  expect(wet.reachable).toBe(true);
  expect(wet.distanceKm).toBeGreaterThan(dry.distanceKm);
  expect(wet.roadIds.every((id) => !blockedRoadIds.includes(id))).toBe(true);
});

test('STOMP delivers new incident events to the correct workspace', async ({ page, request, baseURL }) => {
  const session = randomUUID();
  const citizen = await apiRole(request, session, 'CITIZEN');
  const coordinator = await apiRole(request, session, 'COORDINATOR');
  await page.goto('/');
  const url = new URL(process.env.HYDROGRID_TEST_WS_URL ?? '/ws', baseURL);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';

  await page.evaluate(({ url, token, session }) => {
    window.hydroGridStompTest = { subscribed: false, events: [], error: '' };
    const trace = window.hydroGridStompTest;
    const socket = new WebSocket(url, 'v12.stomp');
    socket.addEventListener('open', () => socket.send(
      `CONNECT\naccept-version:1.2\nhost:hydrogrid\nAuthorization:Bearer ${token}\nheart-beat:0,0\n\n\0`,
    ));
    socket.addEventListener('error', () => { trace.error = 'Socket error'; });
    socket.addEventListener('message', ({ data }) => {
      if (data.startsWith('CONNECTED')) {
        socket.send(`SUBSCRIBE\nid:1\ndestination:/topic/updates/${session}\nack:auto\n\n\0`);
        trace.subscribed = true;
      } else if (data.startsWith('MESSAGE')) {
        trace.events.push(JSON.parse(data.split('\n\n')[1].replace(/\0.*/s, '')));
      } else if (data.startsWith('ERROR')) {
        trace.error = data;
      }
    });
  }, { url: url.href, token: coordinator.token, session });

  await expect.poll(() => page.evaluate(() => {
    const { subscribed, error } = window.hydroGridStompTest;
    return error || subscribed;
  })).toBe(true);
  const created = new Set();
  await expect.poll(async () => {
    const events = await page.evaluate(() => window.hydroGridStompTest.events.map((item) => item.entityId));
    if (events.some((id) => created.has(id))) return true;
    const response = await citizen.post('/api/incidents', sampleIncident());
    expect(response.ok()).toBeTruthy();
    created.add((await response.json()).id);
    return false;
  }, { intervals: [300, 600, 1000] }).toBe(true);
});

test('dispatch, mission completion, and shelter admission stay in one exercise workspace', async ({ request }) => {
  const session = randomUUID();
  const citizen = await apiRole(request, session, 'CITIZEN');
  const coordinator = await apiRole(request, session, 'COORDINATOR');
  const responder = await apiRole(request, session, 'RESPONDER');
  const shelterOperator = await apiRole(request, session, 'SHELTER');
  const create = await citizen.post('/api/incidents', sampleIncident());
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();

  const assignment = await coordinator.post(`/api/incidents/${id}/dispatch`, {});
  expect(assignment.ok(), await assignment.text()).toBeTruthy();
  expect((await assignment.json()).assignedUnitId).toBeTruthy();

  let resolved;
  for (const status of ['EN_ROUTE', 'ON_SCENE', 'RESOLVED']) {
    const changed = await responder.post(`/api/incidents/${id}/status`, { clientId: randomUUID(), status });
    expect(changed.ok(), await changed.text()).toBeTruthy();
    resolved = await changed.json();
    expect(resolved.status).toBe(status);
  }

  const incidents = await (await coordinator.get('/api/incidents')).json();
  expect(incidents.find((row) => row.id === id)?.status).toBe('RESOLVED');

  const shelterList = () => shelterOperator.get('/api/shelters');
  const shelter = (await (await shelterList()).json()).find(({ available }) => available >= 2);
  expect(shelter).toBeDefined();
  const hold = await shelterOperator.post(`/api/shelters/${shelter.id}/reservations`, {
    clientId: randomUUID(), incidentId: id, people: 2,
  });
  expect(hold.ok(), await hold.text()).toBeTruthy();
  const reservation = await hold.json();
  expect(reservation).toMatchObject({ incidentId: id, people: 2, status: 'RESERVED' });
  const admission = await shelterOperator.post(`/api/shelters/${shelter.id}/reservations/${reservation.id}/admit`);
  expect(admission.ok(), await admission.text()).toBeTruthy();
  expect((await admission.json()).status).toBe('ADMITTED');
  expect((await (await shelterList()).json()).find(({ id }) => id === shelter.id)).toMatchObject({
    reserved: shelter.reserved, admitted: shelter.admitted + 2, available: shelter.available - 2,
  });
});

test('a valid exercise ID cannot mint tokens without its ownership proof', async ({ request }) => {
  const session = randomUUID();
  const authorized = await apiRole(request, session, 'COORDINATOR');
  expect((await authorized.get('/api/incidents')).status()).toBe(200);
  const proofMissing = await request.post('/api/auth/demo', {
    headers: { 'X-Demo-Session': session },
    data: { role: 'COORDINATOR' },
  });
  expect(proofMissing.status()).toBe(400);
  const wrongProof = await request.post('/api/auth/demo', {
    headers: { 'X-Demo-Session': session, 'X-Demo-Owner': randomBytes(32).toString('hex') },
    data: { role: 'COORDINATOR' },
  });
  expect(wrongProof.status()).toBe(403);
});
