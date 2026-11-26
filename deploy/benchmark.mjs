import { randomUUID } from 'node:crypto';

const base = process.env.HYDROGRID_BASE_URL ?? 'http://127.0.0.1:8080';
const session = randomUUID();
const request = async (path, body, headers) => {
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
};

const { token } = await request('/api/auth/demo', { role: 'COORDINATOR' }, {
  'X-Demo-Session': session,
});
const headers = { Authorization: `Bearer ${token}` };
const inputs = { incidents: 100, units: 15, floodIntensity: 40, networkDisruption: 30 };

console.log('# HydroGrid dispatch benchmark');
console.log('');
console.log('100 synthetic reports, 15 units, 40% flood intensity, and 30% network disruption. The replay horizon is 120 minutes.');
console.log('');
console.log('| Seed | Strategy | Offline reports | Average response (min) | Critical served | Fleet utilization | Unserved |');
console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
for (const seed of [42, 1337, 7]) {
  const result = await request('/api/simulation', { seed, ...inputs }, headers);
  for (const [label, metrics] of [['FIFO', result.baseline], ['HydroGrid', result.hydroGrid]]) {
    const average = metrics.averageResponseMinutes?.toFixed(2) ?? '—';
    const critical = `${metrics.criticalServed}/${metrics.criticalIncidents}`;
    const utilization = `${metrics.utilizationPercent.toFixed(2)}%`;
    console.log(`| ${seed} | ${label} | ${result.summary.offlineReports} | ${average} | ${critical} | ${utilization} | ${metrics.unservedIncidents} |`);
  }
}
