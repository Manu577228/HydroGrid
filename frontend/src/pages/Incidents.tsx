import * as Dialog from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, ArrowLeft, ArrowRight, ArrowUpRight, ClipboardList, Download, History, MapPin, Search, Truck, X } from 'lucide-react'
import { type FormEvent, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Button, Empty, ErrorNotice, hazardLabels, Loading, PageTitle, PanelTitle, SeverityBadge, StatusBadge, statusLabels } from '../components/ui'
import {
  chartTime, compactId, downloadCsv, eventName, hazardValues, queryString, severityValues, statusValues,
  useIncident, useIncidents, uuidPattern, type IncidentFilters,
} from '../intelligence'
import { useNetwork } from '../network'
import type { Hazard, IncidentStatus, Severity } from '../types'
import '../intelligence.css'

function allowed<T extends string>(scope: T[], value: string | null) {
  return scope.find((item) => item === value)
}

function toInputTime(value?: string) {
  const stamp = value ? Date.parse(value) : NaN
  return Number.isFinite(stamp) ? new Date(stamp + 19_800_000).toISOString().slice(0, 16) : ''
}

function IncidentDrawer({ id, onClose, restoreFocus }: { id: string; onClose: () => void; restoreFocus: () => void }) {
  const { offline } = useNetwork()
  const incident = useIncident(id)
  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => api.timeline(id), enabled: Boolean(id) && !offline })
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled: Boolean(incident.data?.assignedUnitId) && !offline })
  const details = incident.data
  const location = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: Boolean(details) && !offline })
  const place = location.data?.nodes.find((node) => node.id === details?.nodeId)
  const assigned = units.data?.find((unit) => unit.id === details?.assignedUnitId)
  return <Dialog.Root open={Boolean(id)} onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content className="intel-drawer" onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus() }}>
        <header className="intel-drawer-heading">
          <div><Dialog.Title>{details?.summary ?? 'Incident details'}</Dialog.Title><Dialog.Description>{compactId(id)} · Bengaluru exercise</Dialog.Description></div>
          <Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close incident details"><X size={20} /></Button></Dialog.Close>
        </header>
        {!details && (offline ? <Empty>Reconnect to open or refresh incident details.</Empty> : incident.isPending ? <Loading label="Loading incident details" /> : <ErrorNotice error={incident.error} />)}
        {details && <div className="intel-drawer-body">
          <div className="intel-drawer-tags"><SeverityBadge severity={details.severity} /><StatusBadge status={details.status} /><span>{hazardLabels[details.hazard]}</span></div>
          <dl className="intel-detail-list">
            <div><dt>Reported</dt><dd><time dateTime={details.createdAt}>{chartTime(details.createdAt)}</time> IST</dd></div>
            <div><dt>Location</dt><dd>{place?.label ?? details.nodeId}</dd></div>
            <div><dt>People reported</dt><dd>{details.people}</dd></div>
            <div><dt>Assigned unit</dt><dd>{assigned ? <Link className="text-link" to={'/units?id=' + assigned.id}>{assigned.name}</Link> : details.assignedUnitId ? compactId(details.assignedUnitId) : 'Unassigned'}</dd></div>
            <div><dt>Priority score</dt><dd>{details.score}</dd></div>
            {details.groupId && <div><dt>Related report group</dt><dd>{compactId(details.groupId)}</dd></div>}
            {details.hazard === 'FLOOD' && <div><dt>Water depth reported</dt><dd>{details.depthCm} cm</dd></div>}
          </dl>
          <div className="intel-detail-actions">
            <Link className="button button-outline button-sm" to={'/command?incident=' + details.id}><MapPin size={15} /> View on command map</Link>
            {details.assignedUnitId && <Link className="button button-outline button-sm" to={'/responder?mission=' + details.id}><Truck size={15} /> Open mission</Link>}
          </div>
          <section className="intel-detail-section"><h3>Priority breakdown</h3>
            <dl className="intel-detail-list">{details.reasons.map((reason) => <div key={reason.label}><dt>{reason.label}</dt><dd>{reason.points > 0 ? '+' : ''}{reason.points}</dd></div>)}</dl>
          </section>
          <section className="intel-detail-section"><h3><History size={17} /> Audit timeline</h3>
            {timeline.data?.length ? <ol className="intel-record-list intel-timeline">{timeline.data.map((event) => <li key={event.id}>
              <div className="intel-plain-row"><div><strong>{eventName(event.type)}</strong><small>{event.detail}</small></div><time dateTime={event.createdAt}>{chartTime(event.createdAt)}</time></div>
            </li>)}</ol> : <Empty>{offline ? 'The timeline refreshes when connected.' : timeline.isPending ? 'Loading timeline' : 'No recorded events.'}</Empty>}
            <ErrorNotice error={timeline.error} />
          </section>
        </div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

export function IncidentsPage() {
  const [params, setParams] = useSearchParams()
  const opener = useRef<HTMLElement | null>(null)
  const { offline } = useNetwork()
  const filters: IncidentFilters = {
    q: params.get('q')?.slice(0, 100),
    severity: allowed<Severity>(severityValues, params.get('severity')),
    hazard: allowed<Hazard>(hazardValues, params.get('hazard')),
    status: allowed<IncidentStatus>(statusValues, params.get('status')),
    start: params.get('start') ?? undefined,
    end: params.get('end') ?? undefined,
    sort: allowed(['PRIORITY', 'NEWEST', 'OLDEST', 'PEOPLE'], params.get('sort')) ?? 'PRIORITY',
    page: /^\d{1,7}$/.test(params.get('page') ?? '') ? params.get('page')! : '1',
  }
  const reports = useIncidents(filters)
  const data = reports.data
  const preferred = params.get('id') ?? ''
  const id = uuidPattern.test(preferred) ? preferred : ''
  const filterKey = queryString(filters)
  const openIncident = (next: string, button: HTMLElement) => {
    opener.current = button
    const changed = new URLSearchParams(params)
    changed.set('id', next)
    setParams(changed)
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? '').trim()
    const start = value('start')
    const end = value('end')
    setParams(queryString({
      q: value('q'), severity: value('severity') as Severity, hazard: value('hazard') as Hazard,
      status: value('status') as IncidentStatus, sort: value('sort'),
      start: start ? new Date(start + '+05:30').toISOString() : undefined, end: end ? new Date(end + '+05:30').toISOString() : undefined,
    }))
  }

  function exportPage() {
    if (!data) return
    downloadCsv('hydrogrid-incidents-page-' + data.page, ['Reference', 'Summary', 'Hazard', 'Severity', 'Status', 'Reported people', 'Node', 'Reported at (UTC)', 'Assigned unit', 'Group'], data.items.map((row) => [
      row.id, row.summary, row.hazard, row.severity, row.status, row.people, row.nodeId, row.createdAt, row.assignedUnitId, row.groupId,
    ]))
  }

  return <div className="intel-page">
    <PageTitle title="Incident management" description="Review, filter and trace individual incident reports in this exercise." icon={<ClipboardList />}
      actions={<><Button onClick={exportPage} variant="outline" size="sm" disabled={!data?.items.length}><Download size={15} /> Export page CSV</Button><Link className="button button-primary button-sm" to="/sos">Practice SOS <ArrowUpRight size={14} /></Link></>} />
    <section className="panel intel-register" aria-label="Incident register">
      <PanelTitle title="Incident register" detail={data ? data.total + ' reports matching current filters' : 'Bengaluru exercise'} icon={<ClipboardList size={17} />} />
      <form className="intel-filters" onSubmit={apply} key={filterKey}>
        <label className="field-label intel-filter-query"><span><Search size={14} /> Search incidents</span><input name="q" type="search" autoComplete="off" defaultValue={filters.q} maxLength={100} placeholder="Reference, location or report summary" /></label>
        <label className="field-label">Severity<select name="severity" defaultValue={filters.severity ?? ''}><option value="">All severity bands</option>{severityValues.map((value) => <option value={value} key={value}>{eventName(value)}</option>)}</select></label>
        <label className="field-label">Status<select name="status" defaultValue={filters.status ?? ''}><option value="">All statuses</option>{statusValues.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>
        <label className="field-label">Category<select name="hazard" defaultValue={filters.hazard ?? ''}><option value="">All categories</option>{hazardValues.map((value) => <option value={value} key={value}>{hazardLabels[value]}</option>)}</select></label>
        <label className="field-label">From (IST)<input name="start" type="datetime-local" defaultValue={toInputTime(filters.start)} /></label>
        <label className="field-label">Until (IST)<input name="end" type="datetime-local" defaultValue={toInputTime(filters.end)} /></label>
        <label className="field-label"><span><ArrowDownUp size={14} /> Sort by</span><select name="sort" defaultValue={filters.sort}><option value="PRIORITY">Priority</option><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="PEOPLE">Reported headcount</option></select></label>
        <div className="intel-detail-actions"><Button type="submit" size="sm" variant="secondary">Apply filters</Button><Link className="button button-ghost button-sm" to="/incidents">Clear</Link></div>
      </form>
      {data?.items.length ? <div className="table-scroll intel-table-wrap" role="region" aria-label="Incident results" tabIndex={0}>
        <table className="data-table intel-table"><thead><tr><th scope="col">Report</th><th scope="col">Severity</th><th scope="col">Status</th><th scope="col">Location</th><th scope="col">People</th><th scope="col">Reported (IST)</th></tr></thead>
          <tbody>{data.items.map((row) => <tr key={row.id}><th scope="row"><button className="intel-row-button" onClick={(event) => openIncident(row.id, event.currentTarget)}><span>{row.summary}</span><small>{compactId(row.id)} · {hazardLabels[row.hazard]}</small></button></th><td><SeverityBadge severity={row.severity} /></td><td><StatusBadge status={row.status} /></td><td>{row.nodeId}</td><td>{row.people}</td><td><time dateTime={row.createdAt}>{chartTime(row.createdAt)}</time></td></tr>)}</tbody>
        </table>
      </div> : reports.isFetching ? <Loading label="Loading incident records" /> : offline ? <Empty>Incident records load when the exercise reconnects.</Empty> : !reports.isError && <Empty>No incidents match these filters.</Empty>}
      <ErrorNotice error={reports.error} />
      {data && data.pages > 1 && <footer className="panel-footer intel-pages">
        <Link className="button button-outline button-sm" aria-disabled={data.page === 1} to={'/incidents' + queryString({ ...filters, page: String(Math.max(1, data.page - 1)) })}><ArrowLeft size={14} /> Previous</Link>
        <span>Page {data.page} of {data.pages}</span><Link className="button button-outline button-sm" aria-disabled={data.page === data.pages} to={'/incidents' + queryString({ ...filters, page: String(Math.min(data.pages, data.page + 1)) })}>Next <ArrowRight size={14} /></Link>
      </footer>}
    </section>
    <IncidentDrawer id={id} onClose={() => { const changed = new URLSearchParams(params); changed.delete('id'); setParams(changed) }} restoreFocus={() => opener.current?.focus()} />
  </div>
}
