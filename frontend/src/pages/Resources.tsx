import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, MapPin, Search, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { OperatingMap } from '../components/Map'
import { Empty, equipmentLabel, ErrorNotice, Loading, PageTitle, PanelTitle, StatusBadge } from '../components/ui'
import { compactId, uuidPattern } from '../intelligence'
import { useNetwork } from '../network'
import '../intelligence.css'

export function ResourcesPage() {
  const { offline } = useNetwork()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled: !offline })
  const missions = useQuery({ queryKey: ['incidents-assigned'], queryFn: () => api.incidents('RESPONDER'), enabled: !offline })
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const unitId = params.get('id') ?? ''
  const selected = uuidPattern.test(unitId) ? units.data?.find((unit) => unit.id === unitId) : undefined
  const term = filter.trim().toLowerCase()
  const rows = units.data?.filter((unit) => (!status || status === unit.status) &&
    (!term || [unit.name, unit.nodeId, unit.id, equipmentLabel(unit.equipment)].some((value) => value.toLowerCase().includes(term)))) ?? []
  const currentMission = missions.data?.find((mission) => mission.assignedUnitId === selected?.id && mission.status !== 'RESOLVED')
  const location = graph.data?.nodes.find((node) => node.id === selected?.nodeId)
  return <div className="intel-page">
    <PageTitle title="Rescue units" description="Inspect workspace vehicles, equipment, capacity, and active assignments." icon={<Truck />}
      actions={<Link className="button button-primary button-sm" to="/responder">Responder console <ArrowUpRight size={14} /></Link>} />
    <div className="intel-grid">
      <section className="panel intel-wide">
        <PanelTitle title="Fleet register" detail={units.data ? units.data.filter((unit) => unit.status === 'AVAILABLE').length + ' available of ' + units.data.length : 'Bengaluru exercise'} icon={<Truck size={17} />} />
        <div className="intel-filters">
          <label className="field-label intel-filter-query"><span><Search size={14} /> Search units</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Unit name, reference, location or equipment" /></label>
          <label className="field-label">Availability<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All units</option><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option></select></label>
        </div>
        {rows.length ? <div className="table-scroll intel-table-wrap" role="region" aria-label="Rescue fleet results" tabIndex={0}><table className="data-table intel-table">
          <thead><tr><th scope="col">Unit</th><th scope="col">Availability</th><th scope="col">Capacity</th><th scope="col">Equipment</th></tr></thead>
          <tbody>{rows.map((unit) => <tr key={unit.id}><th scope="row"><button className="intel-row-button" onClick={() => setParams({ id: unit.id })} aria-pressed={selected?.id === unit.id}><span>{unit.name}</span><small>{compactId(unit.id)} · {unit.nodeId}</small></button></th><td><span className={'tag ' + (unit.status === 'AVAILABLE' ? 'tag-green' : 'tag-neutral')}>{unit.status === 'AVAILABLE' ? 'Available' : 'Busy'}</span></td><td>{unit.capacity} people</td><td>{equipmentLabel(unit.equipment)}</td></tr>)}</tbody></table></div>
          : offline ? <Empty>The fleet register loads when connected.</Empty> : units.isPending ? <Loading label="Loading rescue units" /> : !units.isError && <Empty>No units match these filters.</Empty>}
        <ErrorNotice error={units.error} />
      </section>
      <section className="panel intel-figure">
        <PanelTitle title={selected?.name ?? 'Unit details'} detail={selected ? compactId(selected.id) : 'Select a unit in the fleet register'} icon={<Truck size={17} />} />
        {selected ? <div className="intel-drawer-body">
          <dl className="intel-detail-list">
            <div><dt>Location</dt><dd>{location?.label ?? selected.nodeId}</dd></div>
            <div><dt>Capacity</dt><dd>{selected.capacity} people</dd></div>
            <div><dt>Equipment</dt><dd>{equipmentLabel(selected.equipment)}</dd></div>
            <div><dt>Active mission</dt><dd>{currentMission ? <StatusBadge status={currentMission.status} /> : selected.status === 'AVAILABLE' ? 'No active mission' : missions.isPending && !offline ? 'Checking assignments' : 'Unavailable'}</dd></div>
          </dl>
          {currentMission && <Link className="button button-outline button-sm" to={'/responder?mission=' + currentMission.id}>Open assigned mission <ArrowUpRight size={15} /></Link>}
          <ErrorNotice error={missions.error} />
        </div> : <Empty>Choose a rescue unit to see location and assignment.</Empty>}
      </section>
      <section className="panel intel-full">
        <PanelTitle title="Fleet map" detail="Exercise-only locations" icon={<MapPin size={17} />} />
        {graph.data ? <OperatingMap graph={graph.data} units={selected ? [selected] : rows} className="intel-map" /> : <Empty>{offline ? 'Reconnect to load the fleet map.' : 'Loading the exercise map'}</Empty>}
        <ErrorNotice error={graph.error} />
      </section>
    </div>
  </div>
}
