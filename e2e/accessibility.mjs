import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const origin = process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080';
const widths = [1920, 1440, 1024, 768, 390, 360];
const core = ['', 'dashboard', 'command', 'incidents', 'sos', 'responder', 'shelters', 'simulation'];
const extra = ['analytics', 'units', 'live', 'operations', 'login', 'register'];
const viewports = widths.flatMap((width) => ['dark', 'light'].map((theme) => ({ width, theme })));
const browser = await chromium.launch({ executablePath: process.env.HYDROGRID_CHROME_PATH });
const results = [];

async function scan({ width, theme }) {
  const context = await browser.newContext({
    viewport: { width, height: width >= 1024 ? 1000 : 850 },
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const expanded = width === 390 || width === 1440;
    for (const route of expanded ? [...core, ...extra] : core) {
      errors.length = 0;
      await page.goto(new URL('/#/' + route, origin).href);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.locator('html[data-theme="' + theme + '"]').waitFor({ state: 'attached' });
      if (route === 'dashboard') await page.getByRole('heading', { name: 'Severity distribution' }).waitFor();
      if (route === 'command') await page.getByRole('button', { name: 'Review selected report' }).waitFor();
      if (route === 'shelters') await page.getByRole('heading', { name: 'Shelter map' }).waitFor();
      if (route === 'simulation' && expanded) {
        await page.getByRole('button', { name: 'Run simulation' }).click();
        await page.getByRole('region', { name: 'Dispatch strategy comparison' }).waitFor();
      }
      if (!(await page.evaluate(() => typeof window.axe === 'object'))) {
        await page.addScriptTag({ path: axePath });
      }
      const report = await page.evaluate(async () => ({
        overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
        axe: (await window.axe.run({
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })),
      }));
      const result = { width, theme, route: route || 'overview', errors: [...errors], ...report };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally {
    await context.close();
  }
}

try {
  for (let offset = 0; offset < viewports.length; offset += 4) {
    await Promise.all(viewports.slice(offset, offset + 4).map(scan));
  }
  const issues = results.filter(({ errors, overflow, axe }) => errors.length || overflow || axe.length);
  console.log(JSON.stringify({ scans: results.length, issues: issues.length }));
  assert.equal(results.length, 120);
  assert.equal(issues.length, 0);
} finally {
  await browser.close();
}
