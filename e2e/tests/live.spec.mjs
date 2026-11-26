import { expect, test } from '@playwright/test';

const fieldCode = process.env.HYDROGRID_TEST_FIELD_ACCESS_CODE;
const testHost = new URL(process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080').hostname;
const sample = { latitude: 12.9752, longitude: 77.605, accuracy: 8 };

test('Live Bengaluru routes on mapped streets and reads device GPS with permission', async ({ page, context, request }) => {
  const network = await request.get('/geography/bengaluru-v1.json');
  expect(network.ok()).toBeTruthy();
  expect((await network.text()).length).toBeGreaterThan(100_000);

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(sample);
  await page.goto('/#/live');
  const start = page.getByRole('combobox', { name: 'Starting place' });
  const destination = page.getByRole('combobox', { name: 'Destination' });
  await expect(start).toBeVisible();
  const initial = await destination.inputValue();
  const alternatives = await destination.locator('option').evaluateAll((options) => options.map((option) => option.value));
  const currentStart = await start.inputValue();
  const next = alternatives.find((option) => option && option !== initial && option !== currentStart);
  expect(next).toBeDefined();
  await destination.selectOption(next);
  await expect(page.getByText(/\d+\.\d+ km/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /OpenStreetMap/i }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Enable device location' }).click();
  await expect(page.getByRole('button', { name: 'Follow device' })).toBeEnabled();
  await page.getByRole('button', { name: 'Stop device location' }).click();
  await expect(page.getByRole('button', { name: 'Enable device location' })).toBeVisible();
  expect((await request.get('/api/field/board')).status()).toBe(401);
  await page.getByRole('button', { name: 'Private field test' }).click();
  await expect(page).toHaveURL(/#\/live$/);

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByText(/\d+\.\d+ km along streets/)).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('the local field workspace shares an opted-in fix with a second device', async ({ page, context, request }) => {
  test.skip(!fieldCode || !['127.0.0.1', 'localhost', '[::1]'].includes(testHost), 'Runs only on a local test instance with an access code.');

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(sample);
  await page.goto('/#/live');
  await page.getByLabel('Workspace access code').fill(fieldCode);
  await page.getByRole('button', { name: 'Unlock workspace' }).click();
  await page.getByRole('button', { name: 'Enable device location' }).click();
  const label = `QA handset ${Date.now()}`;
  await page.getByLabel('Device label').fill(label);

  const observerAccess = await request.post('/api/field/access', { data: { code: fieldCode } });
  expect(observerAccess.ok()).toBeTruthy();
  const { token } = await observerAccess.json();
  const checkBoard = async () => {
    const response = await request.get('/api/field/board', { headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  };
  const position = async () => (await checkBoard()).positions.find((device) => device.label === label);
  expect(await position()).toBeUndefined();

  await page.getByRole('button', { name: 'Share my location' }).click();
  await expect.poll(position).toMatchObject({ lat: sample.latitude, lng: sample.longitude, accuracy: sample.accuracy });
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect.poll(position).toBeUndefined();

  const note = label + ' test SOS';
  await page.getByLabel('Report note').fill(note);
  await page.getByRole('button', { name: 'Send test report' }).click();
  await expect.poll(async () => (await checkBoard()).reports.find((item) => item.note === note))
    .toMatchObject({ lat: sample.latitude, lng: sample.longitude, accuracy: sample.accuracy });
});
