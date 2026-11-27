import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const hostname = new URL(process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080').hostname;

test('a citizen can register, restore the session, update settings and sign out', async ({ page, request }) => {
  test.skip(!['127.0.0.1', 'localhost', '[::1]'].includes(hostname), 'Account writes run on local fixtures only.');
  const email = `citizen-${randomUUID()}@example.test`;
  const password = 'local-example-account-password';
  await page.setViewportSize({ width: 390, height: 844 });
  const rejected = await request.get('/api/account/profile');
  expect(rejected.status()).toBe(401);

  await page.goto('/#/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('QA Citizen');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByText(email + ' · Citizen', { exact: true })).toBeVisible();
  await page.getByLabel('Display name', { exact: true }).fill('Updated QA Citizen');
  await page.getByRole('combobox', { name: 'Time zone', exact: true }).selectOption('UTC');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Account settings saved.' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Updated QA Citizen');
  await expect(page.getByRole('combobox', { name: 'Time zone', exact: true })).toHaveValue('UTC');
  await page.getByRole('form', { name: 'Account settings' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await page.goto('/#/profile');
  await expect(page.getByRole('heading', { name: 'Sign in to HydroGrid' })).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Updated QA Citizen');
});
