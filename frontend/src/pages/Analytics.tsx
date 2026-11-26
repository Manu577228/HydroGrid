import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, Download, FlaskConical, History, Printer, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, client } from '../api'
import { Benchmark, latestSimulationKey } from '../components/Benchmark'
import { Button, Empty, ErrorNotice, Loading, PageTitle, PanelTitle } from '../components/ui'
import { chartTime, compactId, downloadCsv, eventName, useDashboard } from '../intelligence'
import { useNetwork } from '../network'
import { useQueue } from '../offline'
import type { Simulation } from '../types'
import '../intelligence.css'

const rowsPerPage = 15

function dayPosition(value: string, inclusiveEnd = false) {
  const stamp = value ? Date.parse(value + 'T00:00:00+05:30') : NaN
  return Number.isFinite(stamp) ? stamp + (inclusiveEnd ? 86_400_000 : 0) : undefined
}

export function AnalyticsPage() {
  const { offline, live } = useNetwork()
  const summary = useDashboard(24)
  const events = useQuery({ queryKey: ['audit'], queryFn: api.audit, enabled: !offline, refetchInterval: !offline && !live ? 20_000 : false })
  const latest = useQuery<Simulation>({ queryKey: latestSimulationKey, queryFn: () => client.getQueryData(latestSimulationKey)!, enabled: false })
  const queue = useQueue()
  const [eventType, setEventType] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const term = useDeferredValue(search).trim().toLowerCase()
  const from = dayPosition(start)
  const to = dayPosition(end, true)
  const types = Array.from(new Set(events.data?.map((item) => item.type))).sort()
  const rows = events.data?.filter((item) => {
    const moment = Date.parse(item.createdAt)
    return (!eventType || item.type === eventType) && (from === undefined || moment >= from) &&
      (to === undefined || moment < to) &&
      (!term || [item.type, eventName(item.type), item.detail, item.incidentId ?? ''].some((part) => part.toLowerCase().includes(term)))
  }) ?? []
  const pages = Math.max(1, Math.ceil(rows.length / rowsPerPage))
  const selectedPage = Math.min(page, pages)
  const displayed = rows.slice((selectedPage - 1) * rowsPerPage, selectedPage * rowsPerPage)
  const counts = summary.data?.summary
  const measured = counts?.medianDispatch
  const metrics = [
    { title: 'Active incidents', value: counts?.active, detail: 'Current workspace' },
    { title: 'Open critical', value: counts?.critical, detail: 'Current triage band' },
    { title: 'Median dispatch', value: measured == null ? undefined : measured.toFixed(1) + ' min', detail: 'Paired audit events · last 24 hours' },
    { title: 'Updates delivered', value: queue.filter((row) => row.status === 'sent').length, detail: 'Server acknowledgements on this device' },
    { title: 'Awaiting sync', value: queue.filter((row) => row.status === 'pending').length, detail: 'Exercise actions saved on this device' },
    { title: 'Sync failed', value: queue.filter((row) => row.status === 'failed').length, detail: 'Delivery errors on this device' },
  ]

  return <div className="intel-page">
    <PageTitle icon={<ChartNoAxesCombined size={24} aria-hidden="true" />} title="Analytics & audit" description="Review exercise metrics, compare dispatch policies, and trace committed decisions." actions={<>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer size={15} /> Print summary</Button>
      <Link to="/simulation" className="button button-outline button-sm"><FlaskConical size={15} /> Simulation lab</Link>
    </>} />
    <section className="panel" aria-label="Executive summary">
      <PanelTitle title="Executive summary" detail={summary.data ? 'Updated ' + chartTime(summary.data.generatedAt) + ' IST' : 'Current exercise and device sync'} icon={<Activity size={17} />}
        actions={<Link className="text-link" to="/dashboard">Dashboard charts <ArrowUpRight size={14} /></Link>} />
      <div className="intel-kpis panel-body">
        {metrics.map(({ title, value, detail }) => <div className="panel intel-kpi" key={title}>
          <div>{title}</div><strong>{value ?? '—'}</strong><small>{detail}</small>
        </div>)}
      </div>
      <ErrorNotice error={summary.error} />
    </section>
    {latest.data ? <Benchmark result={latest.data} /> : <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title="Dispatch strategy comparison" actions={<Link className="text-link" to="/simulation">Run a simulation <ArrowUpRight size={15} /></Link>} />
      <Empty>Measured comparison appears here after a simulation runs.</Empty>
    </section>}
    <section className="panel" aria-label="Workspace audit history">
      <PanelTitle icon={<History size={18} />} title="Workspace audit history" detail="Recent committed exercise events · up to 250 entries" actions={
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv('hydrogrid-workspace-audit', ['When (UTC)', 'Type', 'Incident ID', 'Details'],
          rows.map((row) => [row.createdAt, row.type, row.incidentId, row.detail]))}><Download size={14} /> Export audit CSV</Button>
      } />
      <div className="intel-filters">
        <label className="field-label intel-filter-query"><span><Search size={14} /> Search audit history</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Incident reference, event, or detail" /></label>
        <label className="field-label">Event type<select value={eventType} onChange={(event) => { setEventType(event.target.value); setPage(1) }}>
          <option value="">All events</option>{types.map((type) => <option value={type} key={type}>{eventName(type)}</option>)}
        </select></label>
        <label className="field-label">From (IST)<input type="date" value={start} max={end || undefined} onChange={(event) => { setStart(event.target.value); setPage(1) }} /></label>
        <label className="field-label">Through (IST)<input type="date" value={end} min={start || undefined} onChange={(event) => { setEnd(event.target.value); setPage(1) }} /></label>
      </div>
      {displayed.length ? <div className="table-scroll intel-table-wrap" role="region" aria-label="Workspace audit table" tabIndex={0}>
        <table className="data-table"><thead><tr><th scope="col">Time (IST)</th><th scope="col">Event</th><th scope="col">Incident</th><th scope="col">Details</th></tr></thead><tbody>
          {displayed.map((item) => <tr key={item.id}><td><time dateTime={item.createdAt}>{chartTime(item.createdAt)}</time></td>
            <th scope="row">{eventName(item.type)}</th><td className="mono">{item.incidentId ? <Link className="text-link" to={'/incidents?id=' + item.incidentId}>{compactId(item.incidentId)}</Link> : '—'}</td><td>{item.detail}</td></tr>)}
        </tbody></table>
      </div> : offline ? <Empty>The audit log loads when the exercise reconnects.</Empty> : events.isPending ? <Loading label="Loading audit events" /> : !events.isError && <Empty>No events match this filter.</Empty>}
      {pages > 1 && <div className="panel-footer intel-pages">
        <Button size="sm" variant="outline" disabled={selectedPage === 1} onClick={() => setPage(selectedPage - 1)}><ArrowDownLeft size={14} /> Previous</Button>
        <span>Page {selectedPage} of {pages} · {rows.length} matching</span>
        <Button size="sm" variant="outline" disabled={selectedPage === pages} onClick={() => setPage(selectedPage + 1)}>Next <ArrowUpRight size={14} /></Button>
      </div>}
      <ErrorNotice error={events.error} />
    </section>
  </div>
}
