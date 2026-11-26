import { test, expect } from '@playwright/test';

async function openOfflinePage(page, path, title) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

async function demoWorkspace(page, request) {
  const session = await page.evaluate(() => localStorage.getItem('hydrogrid-demo-session'));
  const coordinator = await request.post('/api/auth/demo', {
    headers: { 'X-Demo-Session': session },
    data: { role: 'COORDINATOR' },
  });
  expect(coordinator.ok()).toBeTruthy();
  const { token } = await coordinator.json();
  return async (path) => {
    const response = await request.get(path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
}

test('a real network outage preserves a queued SOS across reload and synchronizes it once', async ({ page, context, request }) => {
  await openOfflinePage(page, '/#/sos', 'Citizen SOS');
  const read = await demoWorkspace(page, request);
  const incidents = () => read('/api/incidents');
  const initial = await incidents();

  const log = page.getByRole('region', { name: 'SOS delivery log' });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save SOS offline' }).click();
  await expect(log.getByText('Queued offline', { exact: true })).toHaveCount(1);
  expect(await incidents()).toHaveLength(initial.length);

  await page.reload();
  await expect(log.getByText('Queued offline', { exact: true })).toHaveCount(1);
  await context.setOffline(false);
  await expect(log.getByText('Delivered', { exact: true })).toHaveCount(1);
  const delivered = await incidents();
  const added = delivered.filter(({ id }) => !initial.some((row) => row.id === id));
  expect(added).toHaveLength(1);

  await page.reload();
  await expect(log.getByText('Delivered', { exact: true })).toHaveCount(1);
  expect((await incidents()).filter(({ id }) => id === added[0].id)).toHaveLength(1);
});

test('a responder can complete a mission offline and replay both milestones once', async ({ page, context, request }) => {
  await openOfflinePage(page, '/#/responder', 'Responder console');
  await expect(page.getByRole('button', { name: 'Mark on scene' })).toBeVisible();

  const read = await demoWorkspace(page, request);
  const incidents = await read('/api/incidents');
  const mission = incidents.find((incident) => incident.assignedUnitId && incident.status === 'EN_ROUTE');
  expect(mission).toBeTruthy();
  const getMission = async () => (await read('/api/incidents')).find(({ id }) => id === mission.id);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mark on scene' }).click();
  await page.getByRole('button', { name: 'Complete mission' }).click();
  const queued = page.getByRole('status').filter({ hasText: '2 mission updates awaiting sync' });
  await expect(queued).toBeVisible();
  expect((await getMission()).status).toBe('EN_ROUTE');

  await page.reload();
  await expect(queued).toBeVisible();
  await context.setOffline(false);
  await expect(queued).toBeHidden();
  await expect.poll(async () => (await getMission()).status).toBe('RESOLVED');

  const timeline = await read(`/api/incidents/${mission.id}/timeline`);
  const milestones = timeline.filter(({ type }) => type === 'MISSION_ON_SCENE' || type === 'MISSION_RESOLVED');
  expect(milestones.map(({ type }) => type).sort()).toEqual(['MISSION_ON_SCENE', 'MISSION_RESOLVED']);
});

test('the mobile navigation reaches HydroGrid’s seven pages', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const links = [
    ['Command center', 'command'],
    ['Citizen SOS', 'sos'],
    ['Responder console', 'responder'],
    ['Shelters', 'shelters'],
    ['Simulation lab', 'simulation'],
    ['Analytics & audit', 'analytics'],
    ['Overview', ''],
  ];
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  for (const [label, slug] of links) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp('#/' + slug + '$'));
    await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
  }
});

test('the simulation UI shows measured outcomes and replays both policies', async ({ page }) => {
  await page.goto('/#/simulation');
  await page.getByRole('button', { name: 'Run simulation' }).click();
  const comparison = page.getByRole('region', { name: 'Dispatch strategy comparison' });
  await expect(comparison.getByRole('columnheader', { name: 'FIFO' })).toBeVisible();
  await expect(comparison.getByRole('columnheader', { name: 'HydroGrid' })).toBeVisible();
  await expect(comparison.getByRole('row', { name: /Critical incidents served/ })).toContainText('14 / 14');
  await page.getByRole('combobox', { name: 'Playback strategy' }).selectOption('baseline');
  await page.getByRole('button', { name: 'Play scenario' }).click();
  await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: /Playback minute/ }).inputValue()))
    .toBeGreaterThan(0);
});
