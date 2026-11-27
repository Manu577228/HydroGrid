import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test.use({ serviceWorkers: 'block' });

test('the dashboard reacts to committed exercise events and supports chart and search drilldown', async ({ page, request, context }) => {
  await page.goto('/#/dashboard');
  const active = page.getByTestId('dashboard-active-incidents');
  await expect(active).toHaveText(/^\d+$/);
  const startingCount = Number(await active.textContent());
  const controls = page.getByRole('region', { name: 'Dashboard controls' });
  await expect(controls.getByText('Live workspace', { exact: true })).toBeVisible();

  const { id, owner } = await page.evaluate(() => JSON.parse(localStorage.getItem('hydrogrid-demo-credentials')));
  const login = await request.post('/api/auth/demo', {
    headers: { 'X-Demo-Session': id, 'X-Demo-Owner': owner }, data: { role: 'CITIZEN' },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();
  const report = await request.post('/api/incidents', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      clientId: randomUUID(), summary: 'Exercise report', hazard: 'FLOOD', people: 2,
      medical: true, vulnerable: true, depthCm: 90, immediateDanger: true, lat: 12.9806, lng: 77.6092,
    },
  });
  expect(report.ok()).toBeTruthy();
  await expect(active).toHaveText(String(startingCount + 1));

  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const notifications = page.getByRole('dialog', { name: 'Notifications' });
  await expect(notifications.getByRole('link', { name: /Critical SOS|SOS received/ }).first()).toBeVisible();
  await notifications.getByRole('button', { name: 'Mark all as read' }).click();
  await notifications.getByRole('button', { name: 'Unread', exact: true }).click();
  await expect(notifications.getByText('No notifications match this view.')).toBeVisible();
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  try {
    await expect(controls.getByText('Offline', { exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  await expect(controls.getByText('Live workspace', { exact: true })).toBeVisible();

  let releaseIncidentChunk;
  const incidentChunkReady = new Promise((resolve) => { releaseIncidentChunk = resolve; });
  await page.route('**/assets/Incidents-*.js', async (route) => {
    await incidentChunkReady;
    await route.continue();
  });
  try {
    await page.locator('a[href*="severity=CRITICAL"]').first().click();
    await expect(page).toHaveURL(/#\/incidents\?.*severity=CRITICAL/);
    await page.keyboard.press('Control+k');
  } finally {
    releaseIncidentChunk();
  }
  const palette = page.getByRole('dialog', { name: 'Search HydroGrid' });
  await palette.getByRole('searchbox', { name: 'Search workspace' }).fill('Central Relief Hub');
  await palette.getByRole('link', { name: /Central Relief Hub/ }).click();
  await expect(page).toHaveURL(/#\/shelters\?shelter=/);
});

test('theme preferences persist across a reload and dispatch requires confirmation', async ({ page }) => {
  await page.goto('/#/command');
  await page.getByLabel('Theme', { exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Dispatch unit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm exercise dispatch' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm dispatch' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Unit dispatched.' })).toBeVisible();
});
