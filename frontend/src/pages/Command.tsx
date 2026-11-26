import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowRight, BusFront, ChevronRight, CircleCheck, ClipboardList, Crosshair, FlaskConical,
  History, HousePlus, Layers, ListFilter, MapPin, MapPinned, Route as RouteIcon, Siren, UserRound,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, client } from '../api'
import { OperatingMap } from '../components/Map'
import { Button, cn, Empty, equipmentLabel, ErrorNotice, hazardLabels, Loading, Modal, PageTitle, PanelTitle, SeverityBadge, StatusBadge, timestamp } from '../components/ui'
import { useNetwork } from '../network'
import type { Incident, Severity } from '../types'

function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: ReactNode; detail: string; tone?: string }) {
  return <article className="panel metric-card"><div className="metric-top"><span>{label}</span><span className={cn('metric-icon', tone)}>{icon}</span></div><strong>{value}</strong><small>{detail}</small></article>
}

export function CommandPage() {
  const { offline, live } = useNetwork()
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled: !offline })
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled: !offline })
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const shelters = useQuery({ queryKey: ['shelters'], queryFn: api.shelters, enabled: !offline })
  const clusters = useQuery({ queryKey: ['clusters'], queryFn: api.clusters, enabled: !offline })
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState('active')
  const [unitId, setUnitId] = useState('')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [severity, setSeverity] = useState<Severity>('HIGH')
  const [overrideReason, setOverrideReason] = useState('Field verification')
  const [tab, setTab] = useState<'dispatch' | 'history'>('dispatch')
  const [confirmation, setConfirmation] = useState('')
  const all = [...(incidents.data ?? [])].sort((a, b) => b.score - a.score || Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const active = all.filter((item) => item.status !== 'RESOLVED')
  const filtered = filter === 'all' ? all : filter === 'critical' ? active.filter((item) => item.severity === 'CRITICAL') : active
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0]
  const queryId = selected?.id ?? ''
  const recommendations = useQuery({
    queryKey: ['recommendations', queryId], queryFn: () => api.recommendations(queryId), enabled: Boolean(queryId && selected.status === 'REPORTED' && !offline),
  })
  const timeline = useQuery({
    queryKey: ['timeline', queryId], queryFn: () => api.timeline(queryId), enabled: Boolean(queryId && tab === 'history' && !offline),
  })
  const candidate = recommendations.data?.candidates.find((entry) => entry.unitId === unitId) ?? recommendations.data?.candidates[0]
  const related = clusters.data?.find((cluster) => cluster.incidentIds.includes(queryId))
  const relatedIncident = related && all.find((item) => item.id !== queryId && related.incidentIds.includes(item.id))
  const refresh = () => client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'simulation' })
  const dispatch = useMutation({ mutationFn: ({ id, unit }: { id: string; unit: string }) => api.dispatch(id, unit), onSuccess: async () => { setConfirmation('Unit dispatched. The mission is now in the responder console.'); await refresh() } })
  const triage = useMutation({ mutationFn: ({ id, selectedSeverity, reason }: { id: string; selectedSeverity: Severity; reason: string }) => api.triage(id, selectedSeverity, reason), onSuccess: async () => { setOverrideOpen(false); await refresh() } })
  const grouping = useMutation({ mutationFn: api.group, onSuccess: async () => { setConfirmation('Reports grouped. Individual reports and headcounts are preserved.'); await refresh() } })
  useEffect(() => { setUnitId(''); setConfirmation(''); dispatch.reset(); grouping.reset(); triage.reset() }, [queryId])

  const onSelect = (id: string) => {
    if (!filtered.some((incident) => incident.id === id)) setFilter('all')
    setSelectedId(id)
  }

  return <>
    <PageTitle title="Command center" description="Review SOS reports, monitor flood zones, and coordinate rescue units." actions={<>
      <Link to="/simulation" className="button button-outline button-normal"><FlaskConical size={16} /> Simulation lab</Link>
      <Link to="/sos" className="button button-primary button-normal"><Siren size={16} /> New SOS</Link>
    </>} />
    <div className="metrics-grid">
      <Metric label="Active incidents" value={incidents.data ? active.length : '—'} icon={<Siren size={18} />} detail="Open SOS reports" />
      <Metric label="Critical incidents" value={incidents.data ? active.filter((item) => item.severity === 'CRITICAL').length : '—'} icon={<AlertTriangle size={18} />} detail="Highest priority band" tone="metric-coral" />
      <Metric label="Available units" value={units.data ? units.data.filter((unit) => unit.status === 'AVAILABLE').length : '—'} icon={<BusFront size={18} />} detail={units.data ? 'Of ' + units.data.length + ' rescue units' : 'Rescue units'} />
      <Metric label="Shelter spaces" value={shelters.data ? shelters.data.reduce((spaces, shelter) => spaces + shelter.available, 0) : '—'} icon={<HousePlus size={18} />} detail="Available for admission" tone="metric-purple" />
    </div>
    {offline && <div className="notice"><Activity size={17} /> No connection. Live operations resume when HydroGrid is reachable.</div>}
    <div className="command-top">
      <section className="panel command-map-panel">
        <PanelTitle icon={<MapPinned size={17} />} title="Operating map" detail="Flood zones and rescue movements" actions={<span className={cn('connection-status', live && 'connection-live')}><i />{live ? 'Live' : offline ? 'Offline' : 'Connecting'}</span>} />
        {graph.data ? <OperatingMap graph={graph.data} incidents={active} units={units.data} shelters={shelters.data} selected={selected} route={dispatch.isSuccess ? undefined : candidate?.route} onSelect={onSelect} /> : offline ? <Empty>The map will load when connected.</Empty> : graph.isError ? <ErrorNotice error={graph.error} /> : <Loading label="Loading map" />}
        <div className="panel-footer"><Layers size={15} /> <span>{graph.data ? graph.data.blockedRoadIds.length + ' roads blocked at ' + graph.data.intensity + '% flood intensity' : 'Synthetic routes'}.</span><Link to="/simulation" className="text-link">Adjust hazard <ArrowRight size={14} /></Link></div>
      </section>
      <section className="panel incidents-panel">
        <PanelTitle icon={<ClipboardList size={17} />} title="Incident queue" detail="Ordered by triage score" />
        <div className="incident-filters"><ListFilter size={16} /><select aria-label="Filter incidents" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active incidents</option><option value="critical">Critical incidents</option><option value="all">All incident reports</option></select><span>{filtered.length}</span></div>
        <div className="incident-list" aria-label="Incident queue">
          {filtered.map((item) => <IncidentRow key={item.id} incident={item} selected={selected?.id === item.id} onClick={() => setSelectedId(item.id)} />)}
          {!filtered.length && (offline ? <Empty>Incident reports will load when connected.</Empty> : incidents.isError ? <ErrorNotice error={incidents.error} /> : incidents.isPending ? <Loading label="Loading incidents" /> : <Empty>No reports match this filter.</Empty>)}
        </div>
      </section>
    </div>
    {selected && <section className="panel operation-panel" aria-label="Selected incident">
      <PanelTitle icon={<Crosshair size={17} />} title={selected.summary} detail={hazardLabels[selected.hazard] + ' · ' + selected.nodeId + ' · ' + selected.people + ' people'} actions={<div className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /><StatusBadge status={selected.status} /></div>} />
      <div className="tabs" aria-label="Incident details"><button type="button" className={tab === 'dispatch' ? 'current' : ''} onClick={() => setTab('dispatch')}><RouteIcon size={16} /> Dispatch</button><button type="button" className={tab === 'history' ? 'current' : ''} onClick={() => setTab('history')}><History size={16} /> Timeline</button></div>
      {tab === 'dispatch' ? <div className="incident-detail-grid">
        <div>
          <div className="section-heading"><h3>Triage breakdown</h3><strong>{selected.score} points</strong></div>
          <dl className="compact-list">{selected.reasons?.map((reason) => <div key={reason.label}><dt>{reason.label}</dt><dd>{reason.points > 0 ? '+' : ''}{reason.points}</dd></div>)}</dl>
          <Button variant="outline" size="sm" disabled={offline} onClick={() => { setSeverity(selected.severity); setOverrideOpen(true) }}>Review severity</Button>
          {selected.groupId ? <p className="muted small">Group {selected.groupId.slice(0, 8)}. Reports remain separate.</p> : related && relatedIncident && <div className="related-report"><strong>Potentially related SOS</strong><p>{relatedIncident.summary} · {Math.round(related.distanceMeters)} m away</p><Button variant="outline" size="sm" disabled={grouping.isPending || offline} onClick={() => grouping.mutate(related.incidentIds)}>Confirm group</Button><ErrorNotice error={grouping.error} /></div>}
        </div>
        <div>
          <div className="section-heading"><h3>Dispatch recommendation</h3></div>
          {selected.status === 'REPORTED' ? <>
            {recommendations.isPending && !offline && <Loading label="Checking eligible units" />}
            <ErrorNotice error={recommendations.error} />
            {candidate ? <>
              <label className="field-label">Rescue unit<select aria-label="Rescue unit" value={candidate.unitId} onChange={(event) => setUnitId(event.target.value)}>
                {recommendations.data?.candidates.map((item) => <option key={item.unitId} value={item.unitId}>{units.data?.find((unit) => unit.id === item.unitId)?.name ?? item.unitId} · {item.route.travelMinutes.toFixed(1)} min · {item.spareCapacity} spare places</option>)}
              </select></label>
              <div className="route-summary"><RouteIcon size={17} /><div><strong>{candidate.route.distanceKm.toFixed(2)} km · {candidate.route.travelMinutes.toFixed(1)} min</strong><small>Simulated route through accessible roads</small></div></div>
              {units.data?.find((unit) => unit.id === candidate.unitId) && <p className="muted small">Equipment: {equipmentLabel(units.data.find((unit) => unit.id === candidate.unitId)!.equipment)}</p>}
              <Button disabled={dispatch.isPending || offline} onClick={() => dispatch.mutate({ id: selected.id, unit: candidate.unitId })}><ArrowRight size={17} /> Dispatch unit</Button>
            </> : recommendations.data && <div className="notice"><AlertTriangle size={17} />{recommendations.data.reason}</div>}
          </> : <div className="route-summary"><CircleCheck size={18} /><div><strong>{units.data?.find((unit) => unit.id === selected.assignedUnitId)?.name ?? 'Mission recorded'}</strong><small>{selected.status === 'RESOLVED' ? 'Response completed' : 'Follow the incident in the responder console'}</small></div></div>}
          {confirmation && <div className="notice notice-success" role="status"><CircleCheck size={17} />{confirmation}</div>}
          <ErrorNotice error={dispatch.error} />
        </div>
      </div> : <div className="timeline-panel">
        {timeline.data?.map((item) => <div key={item.id} className="timeline-event"><span /><div><strong>{item.type.replaceAll('_', ' ').toLowerCase()}</strong><p>{item.detail}</p></div><time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time></div>)}
        {timeline.isPending && !offline && <Loading label="Loading timeline" />}
        {timeline.data?.length === 0 && <Empty>No events recorded.</Empty>}
        {offline && !timeline.data && <Empty>The timeline loads when connected.</Empty>}
        <ErrorNotice error={timeline.error} />
      </div>}
    </section>}
    <Modal open={overrideOpen} onOpenChange={setOverrideOpen} title="Review incident severity" description="The selected band and review are recorded in the incident timeline.">
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (selected) triage.mutate({ id: selected.id, selectedSeverity: severity, reason: overrideReason }) }}>
        <label className="field-label">Severity band<select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="field-label">Review reason<select value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)}><option>Field verification</option><option>Conditions changed</option><option>Report correction</option></select></label>
        <ErrorNotice error={triage.error} />
        <div className="modal-actions"><Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button><Button type="submit" disabled={triage.isPending || offline}>Save severity</Button></div>
      </form>
    </Modal>
  </>
}

function IncidentRow({ incident, selected, onClick }: { incident: Incident; selected: boolean; onClick: () => void }) {
  return <button type="button" className={cn('incident-row', selected && 'incident-selected')} aria-pressed={selected} onClick={onClick}>
    <span className="incident-row-main"><span className="incident-row-title">{incident.summary}</span><span className="incident-row-meta"><MapPin size={13} />{incident.nodeId}<span>·</span><UserRound size={13} />{incident.people}<span>·</span>{incident.score} pts</span></span>
    <span className="incident-row-end"><SeverityBadge severity={incident.severity} /><ChevronRight size={15} /></span>
  </button>
}
