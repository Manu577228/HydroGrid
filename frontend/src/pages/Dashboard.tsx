import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, Building2, ChartNoAxesCombined, Clock3, CloudUpload,
  Download, FlaskConical, Grid2X2, History, LayoutDashboard, ListChecks, MapPin, Radio, RefreshCw,
  Route, Siren, Truck, UserRound, WifiOff,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, client } from '../api'
import { Benchmark, latestSimulationKey } from '../components/Benchmark'
import { OperatingMap } from '../components/Map'
import { Button, cn, Empty, ErrorNotice, hazardLabels, PageTitle, PanelTitle, SeverityBadge, statusLabels } from '../components/ui'
import {
  chartTime, compactId, downloadCsv, eventName, exerciseTime, periodOptions, queryString, severityValues, useDashboard,
  type Dashboard, type Period,
} from '../intelligence'
import { useNetwork } from '../network'
import { useQueue } from '../offline'
import type { Hazard, IncidentStatus, Severity, Simulation } from '../types'
import '../intelligence.css'

const colors = {
  teal: 'var(--intel-teal)', blue: 'var(--intel-blue)', violet: 'var(--intel-violet)',
  amber: 'var(--intel-amber)', red: 'var(--intel-red)', muted: 'var(--intel-neutral)',
}
const severityColor: Record<Severity, string> = { CRITICAL: colors.red, HIGH: colors.amber, MEDIUM: colors.blue, LOW: colors.teal }
const axis = { fill: 'var(--chart-axis, var(--muted))', fontSize: 11 }
const tooltipStyle = { background: 'var(--intel-tooltip)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text)' }
const grid = 'var(--chart-grid, var(--line))'
const reportColumns = ['Metric', 'Value']

function Figure({ title, detail, icon, children, wide = false, legend }: PropsWithChildren<{
  title: string; detail: string; icon: ReactNode; wide?: boolean; legend?: ReactNode
}>) {
  return <section className={cn('panel intel-figure', wide && 'intel-wide')} aria-label={title}>
    <PanelTitle title={title} detail={detail} icon={icon} />
    <div className="intel-figure-body">{children}</div>
    {legend && <div className="intel-legend">{legend}</div>}
  </section>
}

function Legend({ name, color, count, to }: { name: string; color: string; count?: string | number; to?: string }) {
  const label = <><i style={{ background: color }} />{name}{count !== undefined && <strong>{count}</strong>}</>
  return to ? <Link to={to}>{label}</Link> : <span>{label}</span>
}

function incidentLink(data: Dashboard, filters: Parameters<typeof queryString>[0], at?: string) {
  const start = at && Date.parse(at) > Date.parse(data.since) ? at : data.since
  const upper = at ? Math.min(Date.parse(at) + data.bucketSeconds * 1000, Date.parse(data.generatedAt)) : Date.parse(data.generatedAt)
  return '/incidents' + queryString({ ...filters, start, end: new Date(upper + 1).toISOString() })
}

function Charts({ data }: { data: Dashboard }) {
  const navigate = useNavigate()
  const severity = severityValues.map((key) => ({ name: eventName(key), key, value: data.severity.find((entry) => entry.key === key)?.value ?? 0 }))
  const categories = data.categories.map(({ key, value }) => ({ key, name: hazardLabels[key as Hazard], value }))
  const states = data.lifecycle.map(({ key, value }) => ({ key, name: statusLabels[key as IncidentStatus], value }))
  const statusCount = (phase: IncidentStatus) => data.lifecycle.find(({ key }) => key === phase)?.value ?? 0
  const fleet = [
    { name: 'Available', units: data.summary.availableUnits, color: colors.teal },
    { name: 'Assigned', units: statusCount('ASSIGNED'), color: colors.blue },
    { name: 'En route', units: statusCount('EN_ROUTE'), color: colors.violet },
    { name: 'On scene', units: statusCount('ON_SCENE'), color: colors.amber },
  ]
  const otherBusy = Math.max(0, data.summary.busyUnits - fleet.slice(1).reduce((total, entry) => total + entry.units, 0))
  if (otherBusy > 0) fleet.push({ name: 'Other busy', units: otherBusy, color: colors.muted })
  const occupied = [<Legend key="a" name="Admitted" color={colors.teal} />, <Legend key="r" name="Reserved" color={colors.amber} />, <Legend key="s" name="Available" color={colors.muted} />]
  const responseByBucket = new Map(data.response.map((point) => [point.bucket, point]))
  const response = data.activity.map(({ bucket }) => responseByBucket.get(bucket) ?? { bucket, dispatch: null, arrival: null, resolution: null })
  const maxHour = Math.max(1, ...data.hourly)
  const hasActivity = data.activity.some((point) => point.reported || point.resolved)
  const hasSeverity = severity.some((entry) => entry.value > 0)
  return <>
    <Figure title="Incident activity" detail="Reports received and missions resolved · IST" icon={<Activity size={17} />} wide legend={<><Legend name="Reported" color={colors.teal} /><Legend name="Resolved" color={colors.blue} /><Link className="intel-legend-link" to={incidentLink(data, {})}>Open period <ArrowUpRight size={13} /></Link></>}>
      {hasActivity ? <ResponsiveContainer width="100%" height={224} minWidth={0}>
        <AreaChart data={data.activity} margin={{ left: -20, right: 12, top: 9, bottom: 5 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="bucket" minTickGap={25} tickFormatter={(value) => exerciseTime.format(new Date(value))} tick={axis} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(value) => chartTime(String(value))} contentStyle={tooltipStyle} />
          <Area dataKey="reported" name="Reported" stroke={colors.teal} fill={colors.teal} fillOpacity={.16} strokeWidth={2} isAnimationActive={false} />
          <Area dataKey="resolved" name="Resolved" stroke={colors.blue} fill={colors.blue} fillOpacity={.08} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer> : <Empty>No reports or resolutions in this period.</Empty>}
    </Figure>
    <Figure title="Severity distribution" detail="Current triage bands of reports in the selected period" icon={<Siren size={17} />} legend={severity.map(({ name, key, value }) => <Legend key={key} name={name} color={severityColor[key]} count={value} to={incidentLink(data, { severity: key })} />)}>
      {hasSeverity ? <ResponsiveContainer width="100%" height={202} minWidth={0}>
        <PieChart>
          <Pie data={severity} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="78%" paddingAngle={2} stroke="var(--intel-tooltip)" isAnimationActive={false}
            onClick={(_, index) => { const item = severity[index]; if (item) navigate(incidentLink(data, { severity: item.key })) }}>
            {severity.map(({ key }) => <Cell key={key} fill={severityColor[key]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer> : <Empty>No severity observations in this period.</Empty>}
    </Figure>
    <Figure title="Rescue unit utilization" detail="Current fleet by active mission stage" icon={<Truck size={17} />} wide legend={fleet.map((entry) => <Legend key={entry.name} name={entry.name} color={entry.color} count={entry.units} />)}>
      {data.units.length ? <ResponsiveContainer width="100%" height={126} minWidth={0}>
        <BarChart layout="vertical" data={[Object.fromEntries(fleet.map(({ name, units }) => [name, units]))]} barSize={38} margin={{ left: 6, right: 10, bottom: 4 }}>
          <XAxis type="number" allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" hide /><Tooltip contentStyle={tooltipStyle} />
          {fleet.map(({ name, color }) => <Bar key={name} stackId="fleet" dataKey={name} fill={color} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer> : <Empty>No rescue units are recorded.</Empty>}
    </Figure>
    <Figure title="Mission lifecycle" detail="Current status of all exercise incidents" icon={<ListChecks size={17} />}>
      <ul className="intel-stage-list">{states.map((entry) => <li key={entry.key}>
        <Link to={'/incidents' + queryString({ status: entry.key as IncidentStatus })}>
          <span>{entry.name}</span><strong>{entry.value}</strong><ArrowUpRight size={13} />
        </Link>
        <progress value={entry.value} max={states.reduce((total, row) => total + row.value, 0) || 1} aria-label={entry.name + ' share'} />
      </li>)}</ul>
    </Figure>
    <Figure title="Shelter occupancy" detail="Current admitted, reserved and available spaces" icon={<Building2 size={17} />} wide legend={occupied}>
      {data.shelters.length ? <ResponsiveContainer width="100%" height={228} minWidth={0}>
        <BarChart data={data.shelters} layout="vertical" margin={{ left: 5, right: 12, top: 8, bottom: 5 }} barSize={19}>
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={132} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="admitted" name="Admitted" fill={colors.teal} stackId="beds" isAnimationActive={false} />
          <Bar dataKey="reserved" name="Reserved" fill={colors.amber} stackId="beds" isAnimationActive={false} />
          <Bar dataKey="available" name="Available" fill={colors.muted} stackId="beds" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer> : <Empty>No shelters in this workspace.</Empty>}
    </Figure>
    <Figure title="Incident categories" detail="Reported hazard types in the selected period" icon={<BarChart3 size={17} />}
      legend={categories.map(({ key, name, value }) => <Legend key={key} name={name} count={value} color={colors.blue} to={incidentLink(data, { hazard: key as Hazard })} />)}>
      {categories.some((entry) => entry.value) ? <ResponsiveContainer width="100%" height={194} minWidth={0}>
        <BarChart data={categories} margin={{ left: -23, right: 9, top: 8 }}>
          <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="name" hide /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} /><Bar dataKey="value" name="Reports" fill={colors.blue} radius={[3, 3, 0, 0]} barSize={27} isAnimationActive={false}
            onClick={(_, index) => { const category = categories[index]; if (category) navigate(incidentLink(data, { hazard: category.key as Hazard })) }} />
        </BarChart>
      </ResponsiveContainer> : <Empty>No category reports in this period.</Empty>}
    </Figure>
    <Figure title="Response time trend" detail="Median observed exercise minutes by recorded milestone" icon={<Clock3 size={17} />} wide legend={<><Legend name="Report to dispatch" color={colors.teal} /><Legend name="Dispatch to arrival" color={colors.blue} /><Legend name="Report to resolution" color={colors.violet} /></>}>
      {data.response.length ? <ResponsiveContainer width="100%" height={220} minWidth={0}>
        <LineChart data={response} margin={{ left: -15, right: 18, top: 11, bottom: 5 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="bucket" minTickGap={25} tickFormatter={(value) => exerciseTime.format(new Date(value))} tick={axis} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 'auto']} tick={axis} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={(value) => chartTime(String(value))} formatter={(value) => typeof value === 'number' ? value.toFixed(2) + ' min' : value} contentStyle={tooltipStyle} />
          <Line dataKey="dispatch" name="Report to dispatch" stroke={colors.teal} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="arrival" name="Dispatch to arrival" stroke={colors.blue} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="resolution" name="Report to resolution" stroke={colors.violet} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer> : <Empty>Durations appear after paired milestone timestamps are recorded.</Empty>}
    </Figure>
    <Figure title="Hourly incident heatmap" detail="Time of day in Bengaluru · IST" icon={<Grid2X2 size={17} />} legend={<><Legend name="No reports" color="var(--intel-heat-idle)" /><Legend name="More reports" color={colors.teal} /></>}>
      <div className="intel-heatmap" aria-label="Reported incidents by local hour">
        {data.hourly.map((count, hour) => <div key={hour} className="intel-hour" style={{ background: count ? 'color-mix(in srgb, var(--intel-teal) ' + Math.round(14 + 26 * count / maxHour) + '%, var(--intel-heat-idle))' : undefined }}
          title={String(hour).padStart(2, '0') + ':00, ' + count + ' reports'}><span>{String(hour).padStart(2, '0')}:00</span><strong>{count}</strong></div>)}
      </div>
    </Figure>
  </>
}

export function DashboardPage() {
  const { offline, live } = useNetwork()
  const [hours, setHours] = useState<Period>(6)
  const [time, setTime] = useState(() => Date.now())
  const dashboard = useDashboard(hours)
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const queue = useQueue()
  const navigate = useNavigate()
  const comparison = useQuery<Simulation>({ queryKey: latestSimulationKey, queryFn: () => client.getQueryData(latestSimulationKey)!, enabled: false })
  const runComparison = useMutation({
    mutationFn: () => api.simulation({ seed: 1337, incidents: 100, units: 15, floodIntensity: 40, networkDisruption: 30 }),
    onSuccess: (result) => client.setQueryData(latestSimulationKey, result),
  })

  useEffect(() => {
    const timer = window.setInterval(() => setTime(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const waiting = queue.filter((item) => item.kind === 'report' && item.status === 'pending').length
  const counts = (['pending', 'sent', 'failed'] as const).map((status, index) => ({
    label: ['Waiting', 'Acknowledged', 'Failed'][index], amount: queue.filter((item) => item.status === status).length,
    color: [colors.amber, colors.teal, colors.red][index],
  }))
  const data = dashboard.data
  const summary = data?.summary
  const nearCapacity = data?.shelters.filter((shelter) => (shelter.admitted + shelter.reserved) / shelter.capacity >= .85) ?? []
  const activeStages = data?.lifecycle.filter(({ key, value }) => value > 0 && ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'].includes(key)) ?? []
  const metrics: { title: string; value: string | number | undefined; icon: typeof Activity; detail: string; tone?: string }[] = [
    { title: 'Active incidents', value: summary?.active, icon: Siren, detail: 'Current workspace' },
    { title: 'Critical incidents', value: summary?.critical, icon: AlertTriangle, detail: 'Open critical reports', tone: 'critical' },
    { title: 'People reported', value: summary?.people, icon: UserRound, detail: 'Summed headcount in period' },
    { title: 'Resolved incidents', value: summary?.resolved, icon: ListChecks, detail: 'Current workspace' },
    { title: 'Available units', value: summary?.availableUnits, icon: Truck, detail: 'Ready to assign', tone: 'success' },
    { title: 'Busy units', value: summary?.busyUnits, icon: Truck, detail: 'Currently in use' },
    { title: 'Active missions', value: summary?.missions, icon: Radio, detail: 'Open rescue assignments' },
    { title: 'Shelter occupancy', value: summary && summary.occupied + ' / ' + summary.capacity, icon: Building2, detail: 'Admitted / total places' },
    { title: 'Available places', value: summary?.availablePlaces, icon: Building2, detail: 'After current reservations' },
    { title: 'Blocked roads', value: summary?.blockedRoads, icon: Route, detail: 'Simulated flood closure', tone: 'critical' },
    { title: 'Median dispatch', value: summary?.medianDispatch == null ? undefined : summary.medianDispatch.toFixed(1) + ' min', icon: Clock3, detail: 'Paired audit events in period' },
    { title: 'Pending offline reports', value: waiting, icon: WifiOff, detail: 'On this device' },
  ]

  return <div className="intel-page">
    <PageTitle title="Operations dashboard" description="Bengaluru flood-response exercise" icon={<LayoutDashboard />}
      actions={<><Link className="button button-outline button-sm" to="/incidents">Incidents <ArrowUpRight size={14} /></Link><Link className="button button-primary button-sm" to="/command">Open command center <ArrowUpRight size={14} /></Link></>} />
    <section className="panel intel-toolbar" aria-label="Dashboard controls">
      <div className="intel-health">
        <span className={cn('intel-state', live && 'intel-state-live')}><i />{offline ? 'Offline' : live ? 'Live workspace' : 'Polling'}</span>
        <span><Clock3 size={14} /> {exerciseTime.format(time)} IST</span>
        <span>{data ? 'Updated ' + chartTime(data.generatedAt) : 'Waiting for dashboard data'}</span>
      </div>
      <div className="intel-actions">
        <label className="intel-inline-label">Period <select className="standalone-select" value={hours} onChange={(event) => setHours(Number(event.target.value) as Period)}>{periodOptions.map((value) => <option key={value} value={value}>Last {value} {value === 1 ? 'hour' : 'hours'}</option>)}</select></label>
        <Button size="sm" variant="outline" disabled={offline || dashboard.isFetching} onClick={() => { void dashboard.refetch(); void graph.refetch() }}><RefreshCw size={14} /> Refresh</Button>
        <Button size="sm" variant="outline" disabled={!data} onClick={() => downloadCsv('hydrogrid-dashboard', reportColumns, [
          ['Period start', data?.since ?? null], ['As of', data?.generatedAt ?? null], ...metrics.map(({ title, value }): [string, string | number | null] => [title, value ?? null]),
        ])}><Download size={14} /> Export summary</Button>
      </div>
    </section>
    <div className="intel-kpis" aria-label="Workspace indicators">
      {metrics.map(({ title, value, icon: Icon, detail, tone }) => <section className={cn('panel intel-kpi', tone && 'intel-kpi-' + tone)} key={title}>
        <div><span>{title}</span><Icon size={15} aria-hidden="true" /></div>
        <strong data-testid={'dashboard-' + title.toLowerCase().replaceAll(' ', '-')}>{value ?? '—'}</strong><small>{detail}</small>
      </section>)}
    </div>
    <ErrorNotice error={dashboard.error} />
    {!data && (offline ? <section className="panel"><Empty>Dashboard data is available when the exercise reconnects.</Empty></section>
      : dashboard.isFetching && <div className="intel-skeleton panel" role="status" aria-label="Loading operations dashboard"><span /><span /><span /></div>)}
    {data && <div className="intel-grid">
      <section className="panel intel-figure intel-wide">
        <PanelTitle title="Operating map" icon={<MapPin size={17} />} detail={'Bengaluru exercise network · ' + data.summary.blockedRoads + ' simulated closures'}
          actions={<Link className="text-link" to="/command">Command center <ArrowUpRight size={14} /></Link>} />
        {graph.data ? <OperatingMap graph={graph.data} units={data.units} shelters={data.shelters} incidents={data.mapIncidents}
          onSelect={(id) => navigate('/incidents' + queryString({ id }))} className="intel-map" /> : <Empty>{graph.isError ? 'Map data is temporarily unavailable.' : 'Opening operating map'}</Empty>}
      </section>
      <div className="intel-dashboard-side">
        <section className="panel intel-figure">
          <PanelTitle title="Critical incident queue" icon={<Siren size={17} />} detail="Highest-priority open reports" />
          {data.critical.length ? <ul className="intel-record-list">{data.critical.map((incident) => <li key={incident.id}>
            <Link to={'/incidents' + queryString({ id: incident.id })}>
              <div><strong>{incident.summary}</strong><small>{compactId(incident.id)} · {incident.people} reported</small></div>
              <SeverityBadge severity={incident.severity} />
            </Link>
          </li>)}</ul> : <Empty>No open critical reports in this workspace.</Empty>}
          <div className="panel-footer"><Link className="text-link" to="/incidents?severity=CRITICAL">View critical reports <ArrowUpRight size={14} /></Link></div>
        </section>
        <section className="panel intel-figure">
          <PanelTitle title="Resources on watch" icon={<Radio size={17} />} detail="Current assignments and shelter demand" />
          <div className="intel-resource-watch">
            <div>
              <h3>Active missions</h3>
              {activeStages.length ? <ul>{activeStages.map(({ key, value }) => <li key={key}><Link className="text-link" to={'/incidents' + queryString({ status: key as IncidentStatus })}>{statusLabels[key as IncidentStatus]} <strong>{value}</strong></Link></li>)}</ul>
                : <p>No active missions</p>}
            </div>
            <div>
              <h3>Shelter capacity</h3>
              {nearCapacity.length ? <ul>{nearCapacity.map((shelter) => <li key={shelter.id}><Link className="text-link" to={'/shelters?shelter=' + shelter.id}>{shelter.name} · {shelter.available} free</Link></li>)}</ul>
                : <p>All exercise shelters below 85% admitted and reserved</p>}
            </div>
          </div>
        </section>
      </div>
      <Charts data={data} />
      <Figure title="Offline synchronization" detail="Report and mission delivery states on this device" icon={<CloudUpload size={17} />} legend={counts.map((row) => <Legend key={row.label} name={row.label} count={row.amount} color={row.color} />)}>
        {queue.length ? <ResponsiveContainer width="100%" height={190} minWidth={0}>
          <BarChart data={counts} margin={{ left: -22, right: 10, top: 10 }}>
            <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} /><YAxis tick={axis} allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} /><Bar dataKey="amount" name="Updates" barSize={25} isAnimationActive={false}>{counts.map(({ label, color }) => <Cell key={label} fill={color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer> : <Empty>Delivery activity appears after this device queues a report or mission update.</Empty>}
      </Figure>
      <section className="panel intel-figure intel-wide">
        <PanelTitle title="Recent workspace activity" icon={<History size={17} />} detail="Committed exercise events" actions={<Link className="text-link" to="/analytics">Audit log <ArrowUpRight size={14} /></Link>} />
        {data.recent.length ? <ul className="intel-record-list">{data.recent.map((event) => <li key={event.id}>
          {event.incidentId ? <Link to={'/incidents' + queryString({ id: event.incidentId })}>
            <div><strong>{eventName(event.type)}</strong><small>{event.detail}</small></div><time dateTime={event.createdAt}>{exerciseTime.format(new Date(event.createdAt))}</time>
          </Link> : <div className="intel-plain-row"><div><strong>{eventName(event.type)}</strong><small>{event.detail}</small></div><time dateTime={event.createdAt}>{exerciseTime.format(new Date(event.createdAt))}</time></div>}
        </li>)}</ul> : <Empty>No events have been recorded.</Empty>}
      </section>
      {comparison.data ? <Benchmark result={comparison.data} /> : <section className="panel intel-full">
        <PanelTitle title="Simulation performance comparison" detail="Compare measured results under identical inputs" icon={<ChartNoAxesCombined size={17} />}
          actions={<Link className="text-link" to="/simulation">Simulation lab <ArrowUpRight size={14} /></Link>} />
        <div className="intel-benchmark-empty">
          <p>Run the published seed to compare FIFO with HydroGrid dispatch.</p>
          <Button size="sm" variant="outline" disabled={offline || runComparison.isPending} onClick={() => runComparison.mutate()}><FlaskConical size={15} /> {runComparison.isPending ? 'Running seed 1337' : 'Run seed 1337'}</Button>
        </div>
        <ErrorNotice error={runComparison.error} />
      </section>}
    </div>}
  </div>
}
