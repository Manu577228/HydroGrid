import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, CloudUpload, FlaskConical, History, Inbox, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, client } from '../api'
import { Benchmark, latestSimulationKey } from '../components/Benchmark'
import { Empty, ErrorNotice, Loading, PageTitle, PanelTitle, timestamp } from '../components/ui'
import { useNetwork } from '../network'
import { useQueue } from '../offline'
import type { Simulation } from '../types'

export function AnalyticsPage() {
  const { offline } = useNetwork()
  const events = useQuery({ queryKey: ['audit'], queryFn: api.audit, enabled: !offline })
  const latest = useQuery<Simulation>({ queryKey: latestSimulationKey, queryFn: () => client.getQueryData(latestSimulationKey)!, enabled: false })
  const queue = useQueue()
  const [eventType, setEventType] = useState('all')
  const types = Array.from(new Set(events.data?.map((item) => item.type))).sort()
  const rows = events.data?.filter((item) => eventType === 'all' || item.type === eventType) ?? []
  return <>
    <PageTitle title="Analytics & audit" description="Review benchmark results, synchronization outcomes, and incident history." actions={<Link to="/simulation" className="button button-outline button-normal"><FlaskConical size={16} /> Simulation lab</Link>} />
    <div className="metrics-grid three">
      {[
        { icon: ShieldCheck, label: 'Delivered actions', status: 'sent' },
        { icon: CloudUpload, label: 'Awaiting sync', status: 'pending' },
        { icon: Inbox, label: 'Failed actions', status: 'failed' },
      ].map(({ icon: Icon, label, status }) => <article key={label} className="panel metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div><strong>{queue.filter((item) => item.status === status).length}</strong><small>On this device</small></article>)}
    </div>
    {latest.data ? <Benchmark result={latest.data} /> : <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title="Dispatch strategy comparison" actions={<Link className="text-link" to="/simulation">Run a simulation <ArrowUpRight size={15} /></Link>} />
      <Empty>Run a seeded scenario to generate benchmark results.</Empty>
    </section>}
    <section className="panel">
      <PanelTitle icon={<History size={18} />} title="Incident audit log" detail="Report, triage, dispatch, and response events" actions={<select className="standalone-select" aria-label="Filter audit events" value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="all">All events</option>{types.map((type) => <option value={type} key={type}>{type.replaceAll('_', ' ').toLowerCase()}</option>)}</select>} />
      {rows.length ? <div className="table-scroll panel-body"><table className="data-table"><thead><tr><th>Time</th><th>Event</th><th>Incident ID</th><th>Details</th></tr></thead><tbody>
        {rows.map((item) => <tr key={item.id}><td><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time></td><td className="cell-capitalize">{item.type.replaceAll('_', ' ').toLowerCase()}</td><td className="mono">{item.incidentId?.slice(0, 8) ?? '—'}</td><td>{item.detail}</td></tr>)}
      </tbody></table></div> : offline ? <Empty>The audit log loads when connected.</Empty> : events.isPending ? <Loading label="Loading audit events" /> : !events.isError && <Empty>No events match this filter.</Empty>}
      <ErrorNotice error={events.error} />
    </section>
  </>
}
