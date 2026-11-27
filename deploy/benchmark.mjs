import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

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
  'X-Demo-Owner': randomBytes(32).toString('hex'),
});
const headers = { Authorization: `Bearer ${token}` };
const inputs = { incidents: 100, units: 15, floodIntensity: 40, networkDisruption: 30 };
const seeds = [42, 1337, 7];
const scenarios = [
  { name: 'reference', ...inputs },
  { name: 'flood-surge', incidents: 150, units: 12, floodIntensity: 70, networkDisruption: 50 },
  { name: 'lighter-demand', incidents: 60, units: 18, floodIntensity: 20, networkDisruption: 10 },
];

function studyMetrics(result, metrics, dispatches) {
  const incidents = new Map(result.incidents.map((incident) => [incident.id, incident]));
  const units = new Map(result.units.map((unit) => [unit.id, unit]));
  const blocked = new Set(result.summary.blockedRoadIds);
  const assigned = new Set();
  const nextAvailable = new Map();
  const responseMinutes = [];
  let invalidAssignments = 0;
  for (const dispatch of dispatches) {
    const incident = incidents.get(dispatch.incidentId);
    const unit = units.get(dispatch.unitId);
    const medical = incident.medical || incident.hazard === 'MEDICAL';
    const deepFlood = incident.hazard === 'FLOOD' && incident.depthCm >= 55;
    const shallowFlood = incident.hazard === 'FLOOD' && !deepFlood;
    const boat = unit.equipment.includes('BOAT');
    if (assigned.has(incident.id) || dispatch.dispatchMinute < incident.availableMinute
        || dispatch.dispatchMinute < (nextAvailable.get(unit.id) ?? 0)
        || !dispatch.route.reachable || dispatch.route.roadIds.some((road) => blocked.has(road))
        || unit.capacity < incident.people || (medical && !unit.equipment.includes('MEDICAL'))
        || (deepFlood && !boat) || (shallowFlood && !boat && !unit.equipment.includes('HIGH_CLEARANCE'))) {
      invalidAssignments++;
    }
    assigned.add(incident.id);
    nextAvailable.set(unit.id, dispatch.availableAgainMinute);
    if (dispatch.arrivalMinute <= result.summary.horizonMinutes) {
      responseMinutes.push(dispatch.arrivalMinute - incident.createdMinute);
    }
  }
  responseMinutes.sort((a, b) => a - b);
  if (responseMinutes.length !== metrics.servedIncidents) throw new Error('Replay totals do not match the arrival trace');
  const middle = Math.floor(responseMinutes.length / 2);
  const median = responseMinutes.length % 2 ? responseMinutes[middle]
    : (responseMinutes[middle - 1] + responseMinutes[middle]) / 2;
  return {
    ...metrics,
    medianResponseMinutes: responseMinutes.length ? median : null,
    p95ResponseMinutes: responseMinutes[Math.ceil(responseMinutes.length * 0.95) - 1] ?? null,
    invalidAssignments,
    responseMinutes,
  };
}

if (process.argv.includes('--study')) {
  const runs = [];
  for (const { name, ...scenario } of scenarios) {
    for (const seed of seeds) {
      const start = performance.now();
      const result = await request('/api/simulation', { seed, ...scenario }, headers);
      const requestMs = Math.round((performance.now() - start) * 100) / 100;
      runs.push({
        name, scenario: result.scenario, summary: result.summary, requestMs,
        fifo: studyMetrics(result, result.baseline, result.baselineDispatches),
        hydroGrid: studyMetrics(result, result.hydroGrid, result.hydroGridDispatches),
      });
    }
  }
  console.log(JSON.stringify({ schema: 1, runs }, null, 2));
} else {

  console.log('# HydroGrid dispatch benchmark');
  console.log('');
  console.log('100 synthetic reports, 15 units, 40% flood intensity, and 30% network disruption. The replay horizon is 120 minutes.');
  console.log('');
  console.log('| Seed | Strategy | Offline reports | Average response (min) | Critical served | Fleet utilization | Unserved |');
  console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const seed of seeds) {
    const result = await request('/api/simulation', { seed, ...inputs }, headers);
    for (const [label, metrics] of [['FIFO', result.baseline], ['HydroGrid', result.hydroGrid]]) {
      const average = metrics.averageResponseMinutes?.toFixed(2) ?? '—';
      const critical = `${metrics.criticalServed}/${metrics.criticalIncidents}`;
      const utilization = `${metrics.utilizationPercent.toFixed(2)}%`;
      console.log(`| ${seed} | ${label} | ${result.summary.offlineReports} | ${average} | ${critical} | ${utilization} | ${metrics.unservedIncidents} |`);
    }
  }
}
