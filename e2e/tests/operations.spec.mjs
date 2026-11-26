import { expect, test } from '@playwright/test';

const operatorCode = process.env.HYDROGRID_TEST_OPERATOR_CODE;
const testHost = new URL(process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080').hostname;

test('the public operations page directs callers to 112 and protects the operator board', async ({ page, request }) => {
  await page.goto('/#/operations');
  await expect(page.getByRole('heading', { name: 'Bengaluru operations', exact: true })).toBeVisible();
  await expect(page.locator('a[href="tel:112"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Bengaluru Traffic Police|ASTraM/i }).first()).toBeVisible();
  expect((await request.get('/api/ops/board')).status()).toBe(401);
  expect((await request.post('/api/ops/observations', { data: {} })).status()).toBe(401);
  expect((await request.post('/api/ops/handoffs', { data: {} })).status()).toBe(401);
});

test('a local enrolled operator records a sourced observation and a confirmed handoff', async ({ page }) => {
  test.skip(!operatorCode || !['127.0.0.1', 'localhost', '[::1]'].includes(testHost),
    'Writes only to an isolated loopback test instance.');
  await page.goto('/#/operations');
  await page.getByLabel('Operator ID', { exact: true }).fill('qa-operator');
  await page.getByLabel('Operator access code', { exact: true }).fill(operatorCode);
  await page.getByRole('button', { name: 'Sign in as operator', exact: true }).click();
  await page.getByRole('combobox', { name: /^Observation type/ }).selectOption('FLOOD');
  const site = 'qa-depth-' + Date.now();
  const source = 'qa-reading-' + Date.now();
  await page.getByLabel('Site ID', { exact: true }).fill(site);
  await page.getByLabel('Site name', { exact: true }).fill('QA depth point');
  await page.getByLabel('Latitude', { exact: true }).fill('12.98');
  await page.getByLabel('Longitude', { exact: true }).fill('77.60');
  await page.getByLabel('Observed at (IST)', { exact: true }).fill(new Date(Date.now() + 19_800_000).toISOString().slice(0, 16));
  await page.getByLabel('Agency source reference', { exact: true }).fill(source);
  await page.getByLabel('Measured surface depth (cm)', { exact: true }).fill('24');
  await page.getByRole('button', { name: 'Record observation', exact: true }).click();
  await expect(page.getByText(source, { exact: true })).toBeVisible();

  const reference = 'QA-EXTERNAL-' + Date.now();
  await page.getByLabel('External incident reference', { exact: true }).fill(reference);
  await page.getByRole('checkbox', { name: 'I already relayed this case through an authorized channel.' }).check();
  await page.getByRole('button', { name: 'Record handoff', exact: true }).click();
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record acknowledgement', exact: true }).first().click();
  await page.getByRole('button', { name: 'Record closure', exact: true }).first().click();
  await expect(page.getByText('Closure recorded', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Operator ID', { exact: true })).toBeVisible();
  await expect(page.getByText(reference, { exact: true })).toBeHidden();
});
