import { ArrowRight, BusFront, CircleCheck, ClipboardCheck, MapPin, Navigation, Radio, Route as RouteIcon, Users, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { OperatingMap } from '../components/Map'
import { Button, Empty, equipmentLabel, ErrorNotice, Loading, PageTitle, PanelTitle, SeverityBadge, StatusBadge, statusLabels } from '../components/ui'
import { useNetwork } from '../network'
import { queueMission, useQueue } from '../offline'
import { useSnapshot } from '../snapshots'
import type { IncidentStatus } from '../types'

const nextStatus: Partial<Record<IncidentStatus, IncidentStatus>> = { ASSIGNED: 'EN_ROUTE', EN_ROUTE: 'ON_SCENE', ON_SCENE: 'RESOLVED' }
const nextLabels: Partial<Record<IncidentStatus, string>> = { ASSIGNED: 'Mark en route', EN_ROUTE: 'Mark on scene', ON_SCENE: 'Complete mission' }
const milestones = [
  { status: 'ASSIGNED', icon: ClipboardCheck },
  { status: 'EN_ROUTE', icon: Navigation },
  { status: 'ON_SCENE', icon: MapPin },
  { status: 'RESOLVED', icon: CircleCheck },
] as const

export function ResponderPage() {
  const { offline } = useNetwork()
  const incidents = useSnapshot(['incidents', 'responder'], () => api.incidents('RESPONDER'))
  const units = useSnapshot(['units', 'responder'], () => api.units('RESPONDER'))
  const graph = useSnapshot(['graph', 'responder'], () => api.graph('RESPONDER'))
  const queue = useQueue().filter((action) => action.kind === 'mission')
  const [selectedId, setSelectedId] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [saving, setSaving] = useState(false)
  const [searchParams] = useSearchParams()
  const missions = (incidents.data ?? []).filter((incident) => incident.assignedUnitId || incident.status === 'RESOLVED')
  const requestedId = selectedId ?? searchParams.get('mission')
  const selected = missions.find((incident) => incident.id === requestedId) ?? missions.find((incident) => incident.status !== 'RESOLVED') ?? missions[0]
  const unit = units.data?.find((entry) => entry.id === selected?.assignedUnitId)
  const from = unit?.nodeId ?? ''
  const to = selected?.nodeId ?? ''
  const route = useSnapshot(['route', from, to], () => api.route(from, to), Boolean(from && to && selected?.status !== 'RESOLVED'))
  const missionQueue = queue.filter((action) => (action.payload as { incidentId: string }).incidentId === selected?.id)
  const pending = missionQueue.filter((action) => action.status === 'pending')
  const failed = missionQueue.slice().reverse().find((action) => action.status === 'failed')
  const shownStatus = pending.length ? (pending[pending.length - 1].payload as { status: IncidentStatus }).status : selected?.status
  const next = shownStatus ? nextStatus[shownStatus] : undefined
  const currentStage = milestones.findIndex(({ status }) => status === shownStatus)

  async function update() {
    if (!selected || !next) return
    setSaving(true)
    setError(undefined)
    try { await queueMission(selected.id, next) }
    catch (problem) { setError(problem) }
    finally { setSaving(false) }
  }

  return <>
    <PageTitle icon={<Radio size={24} aria-hidden="true" />} title="Responder console" description="Check a rescue team’s route, then mark when it leaves, arrives, and completes the mission." />
    {offline && <div className="notice"><WifiOff size={17} /> Offline. Mission updates stay on this device until you reconnect.</div>}
    <div className="workspace-split wide-first">
      <section className="panel">
        <PanelTitle icon={<RouteIcon size={17} />} title="Mission route" detail="Simulated travel through the current road network" />
        {graph.data ? <OperatingMap graph={graph.data} incidents={selected ? [selected] : []} units={unit ? [unit] : []} selected={selected} route={route.data} /> : offline ? <Empty>Connect once to save the road graph on this device.</Empty> : graph.isError ? <ErrorNotice error={graph.error} /> : <Loading label="Loading mission map" />}
        {route.data && selected?.status !== 'RESOLVED' && <div className="panel-footer"><RouteIcon size={16} /><span>{route.data.reachable ? route.data.distanceKm.toFixed(2) + ' km · ' + route.data.travelMinutes.toFixed(1) + ' simulated minutes' : 'No accessible route at the current flood intensity.'}</span></div>}
        <ErrorNotice error={route.error} />
      </section>
      <section className="panel">
        <PanelTitle icon={<Radio size={17} />} title="Assigned missions" detail={missions.filter((item) => item.status !== 'RESOLVED').length + ' in progress'} />
        <div className="mission-list">
          {missions.map((item) => <button type="button" className={'mission-row' + (selected?.id === item.id ? ' incident-selected' : '')} key={item.id} aria-pressed={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setError(undefined) }}>
            <div><strong>{item.summary}</strong><small>{item.nodeId} · {item.people} people</small></div><StatusBadge status={item.status} />
          </button>)}
          {!missions.length && (offline ? <Empty>No missions saved on this device.</Empty> : incidents.isError ? <ErrorNotice error={incidents.error} /> : incidents.isPending ? <Loading label="Loading assignments" /> : <Empty><Link to="/command" className="text-link">Dispatch a unit in the command center <ArrowRight size={14} /></Link></Empty>)}
        </div>
      </section>
    </div>
    {selected && shownStatus && <section className="panel">
      <PanelTitle icon={<ClipboardCheck size={18} />} title={selected.summary} detail="Mission details" actions={<SeverityBadge severity={selected.severity} />} />
      <div className="panel-body side-stack">
        <div className="mission-facts">
          <span><MapPin size={17} />{selected.nodeId}</span><span><Users size={17} />{selected.people} people affected</span>
          {unit && <span><BusFront size={17} />{unit.name} · {equipmentLabel(unit.equipment)}</span>}
        </div>
        <div className="mission-progress" role="group" aria-label="Mission milestones">
          {milestones.map(({ status, icon: Icon }, index) => <span key={status} className={index <= currentStage ? 'stage-complete' : ''} aria-current={index === currentStage ? 'step' : undefined}>
            <i>{index < currentStage ? <CircleCheck size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}</i>{statusLabels[status]}
          </span>)}
        </div>
        <ErrorNotice error={error ?? failed?.error} />
        {pending.length > 0 && <div className="notice" role="status"><WifiOff size={17} /> {pending.length} mission update{pending.length === 1 ? '' : 's'} awaiting sync.</div>}
        {next && <div><Button disabled={saving} onClick={() => void update()}><ArrowRight size={16} />{nextLabels[shownStatus]}</Button></div>}
      </div>
    </section>}
  </>
}
