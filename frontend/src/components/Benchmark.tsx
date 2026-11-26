import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartNoAxesCombined, Download } from 'lucide-react'
import type { Simulation, SimulationMetrics } from '../types'
import { Button, PanelTitle } from './ui'

export const latestSimulationKey = ['simulation', 'latest']

function formatAverage(value: number | null) { return value === null ? '—' : value.toFixed(1) + ' min' }
function percent(value: number) { return value.toFixed(1) + '%' }
const metrics: { label: string; value: (metrics: SimulationMetrics) => string | number }[] = [
  { label: 'Average response time', value: (result) => formatAverage(result.averageResponseMinutes) },
  { label: 'Critical incidents served', value: (result) => result.criticalServed + ' / ' + result.criticalIncidents + ' (' + percent(result.criticalServedPercent) + ')' },
  { label: 'Resource utilization', value: (result) => percent(result.utilizationPercent) },
  { label: 'Unserved incidents', value: (result) => result.unservedIncidents },
  { label: 'All incidents served', value: (result) => result.servedIncidents },
]

function download(result: Simulation) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = href
  link.download = 'hydrogrid-seed-' + result.scenario.seed + '.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(href), 500)
}

export function Benchmark({ result }: { result: Simulation }) {
  const points = [
    { name: 'Critical served', FIFO: result.baseline.criticalServedPercent, HydroGrid: result.hydroGrid.criticalServedPercent },
    { name: 'Units utilized', FIFO: result.baseline.utilizationPercent, HydroGrid: result.hydroGrid.utilizationPercent },
  ]
  return <section className="panel benchmark" aria-label="Dispatch strategy comparison">
    <PanelTitle icon={<ChartNoAxesCombined size={18} />} title="Dispatch strategy comparison" detail={'Seed ' + result.scenario.seed + ' · ' + result.scenario.incidents + ' incidents · ' + result.scenario.units + ' units'} actions={<Button variant="outline" size="sm" onClick={() => download(result)}><Download size={15} /> Export JSON</Button>} />
    <div className="benchmark-grid">
      <div className="table-scroll"><table className="data-table benchmark-table"><thead><tr><th scope="col">Metric</th><th scope="col">FIFO</th><th scope="col">HydroGrid</th></tr></thead><tbody>
        {metrics.map(({ label, value }) => <tr key={label}><th scope="row">{label}</th><td>{value(result.baseline)}</td><td>{value(result.hydroGrid)}</td></tr>)}
      </tbody></table></div>
      <div className="benchmark-chart" aria-label="Bar chart comparing critical incidents served and resource utilization">
        <ResponsiveContainer width="100%" height={238} minWidth={130}>
          <BarChart data={points} barSize={30} margin={{ top: 16, right: 12, bottom: 5, left: -13 }}>
            <CartesianGrid stroke="#e4ebe5" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#526b60', fontSize: 12 }} />
            <YAxis domain={[0, 100]} tickFormatter={(value) => value + '%'} tickLine={false} axisLine={false} tick={{ fill: '#526b60', fontSize: 11 }} />
            <Tooltip formatter={(value) => typeof value === 'number' ? percent(value) : value} cursor={{ fill: '#eff5ef' }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 9 }} />
            <Bar dataKey="FIFO" fill="#a8bcb2" radius={[5, 5, 0, 0]} />
            <Bar dataKey="HydroGrid" fill="#37735b" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="panel-footer">Both strategies use the same incidents, resource fleet, road closures, and {result.summary.horizonMinutes}-minute horizon. Response time is averaged over served incidents.</div>
  </section>
}
