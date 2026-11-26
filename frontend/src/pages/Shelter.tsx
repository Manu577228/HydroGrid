import { useMutation, useQuery } from '@tanstack/react-query'
import { BedDouble, Building2, CircleCheck, HeartPulse, HousePlus, Link2, MapPinned, Plus, Route, Search, Ticket, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, client, uuid } from '../api'
import { OperatingMap } from '../components/Map'
import { Button, Empty, ErrorNotice, Loading, Modal, PageTitle, PanelTitle } from '../components/ui'
import { useNetwork } from '../network'
import './workflows.css'

export function ShelterPage() {
  const { offline } = useNetwork()
  const shelters = useQuery({ queryKey: ['shelters'], queryFn: api.shelters, enabled: !offline })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled: !offline })
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const [params] = useSearchParams()
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [reservationOpen, setReservationOpen] = useState(false)
  const [people, setPeople] = useState(1)
  const [incidentId, setIncidentId] = useState('')
  const [clientId, setClientId] = useState('')
  const all = shelters.data ?? []
  const totals = all.reduce((total, site) => ({
    capacity: total.capacity + site.capacity, admitted: total.admitted + site.admitted,
    reserved: total.reserved + site.reserved, available: total.available + site.available,
  }), { capacity: 0, admitted: 0, reserved: 0, available: 0 })
  const visible = all.filter((site) => site.name.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!filter || (filter === 'limited' ? site.available / site.capacity <= .2 : site.type === filter)))
  const selected = visible.find((entry) => entry.id === (selectedId || params.get('shelter'))) ?? visible[0]
  const id = selected?.id ?? ''
  const recommendations = useQuery({ queryKey: ['shelter-recommendations', incidentId], queryFn: () => api.shelterRecommendations(incidentId), enabled: Boolean(incidentId && reservationOpen && !offline) })
  const recommended = recommendations.data?.find((entry) => entry.shelter.available >= people)
  const reservations = useQuery({ queryKey: ['reservations', id], queryFn: () => api.reservations(id), enabled: Boolean(id && !offline) })
  const refresh = () => client.invalidateQueries({ predicate: (query) => ['shelters', 'reservations'].includes(String(query.queryKey[0])) })
  const reserve = useMutation({ mutationFn: () => api.reserve(id, { people, clientId, incidentId: incidentId || undefined }), onSuccess: async () => { setReservationOpen(false); await refresh() } })
  const admit = useMutation({ mutationFn: (reservationId: string) => api.admit(id, reservationId), onSuccess: refresh })

  function openReservation() {
    setClientId(uuid())
    setPeople(1)
    setIncidentId('')
    reserve.reset()
    setReservationOpen(true)
  }

  return <>
    <PageTitle icon={<HousePlus size={24} aria-hidden="true" />} title="Shelter management" description="Choose a shelter, reserve places for an incident, then check people in when they arrive." />
    {offline && <div className="notice"><HousePlus size={17} /> Reconnect to check availability, reserve places, or record arrivals.</div>}
    <div className="metrics-grid">
      {Object.entries({ 'Total places': totals.capacity, 'Admitted': totals.admitted, 'Reserved': totals.reserved, 'Space available': totals.available }).map(([label, value]) =>
        <article className="panel metric-card" key={label}><div className="metric-top"><span>{label}</span><span className="metric-icon"><BedDouble size={17} /></span></div><strong>{shelters.data ? value : '—'}</strong><small>Exercise shelters</small></article>)}
    </div>
    <div className="shelter-tools" aria-label="Filter shelters">
      <label className="field-label"><span><Search size={15} /> Search shelters</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="field-label">Shelter filter<select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">All shelters</option><option value="RELIEF">Relief shelters</option><option value="MEDICAL">Medical shelters</option><option value="limited">At or below 20% capacity available</option>
      </select></label>
    </div>
    <div className="shelter-grid">
      {visible.map((shelter) => <button className={'panel shelter-card' + (selected?.id === shelter.id ? ' shelter-selected' : '')} key={shelter.id} type="button" aria-pressed={selected?.id === shelter.id} onClick={() => { setSelectedId(shelter.id); admit.reset(); reserve.reset() }}>
        <div className="feature-top"><span className="metric-icon">{shelter.type === 'MEDICAL' ? <HeartPulse size={20} /> : <Building2 size={20} />}</span><span className="tag tag-green">{shelter.type === 'MEDICAL' ? 'Medical' : 'Relief'}</span></div>
        <h2>{shelter.name}</h2><div className="shelter-main"><strong>{shelter.available}</strong><span> / {shelter.capacity} places available</span></div>
        <div className="capacity-bar shelter-capacity" role="meter" aria-label="Occupied or reserved capacity" aria-valuemin={0} aria-valuemax={shelter.capacity} aria-valuenow={shelter.admitted + shelter.reserved}>
          <span className="shelter-admitted" style={{ width: shelter.admitted * 100 / shelter.capacity + '%' }} />
          <span className="shelter-reserved" style={{ width: shelter.reserved * 100 / shelter.capacity + '%' }} />
        </div>
        {shelter.available / shelter.capacity <= .2 && <span className="tag tag-high">Limited space</span>}
        <div className="shelter-meta"><span><Ticket size={15} />{shelter.reserved} reserved</span><span><UsersRound size={15} />{shelter.admitted} admitted</span></div>
      </button>)}
    </div>
    {shelters.data && visible.length === 0 && <Empty>No shelters match the filters.</Empty>}
    {graph.data && <section className="panel"><PanelTitle icon={<MapPinned size={17} />} title="Shelter map" detail="Exercise facility locations" />
      <OperatingMap graph={graph.data} shelters={visible} className="small-map" onSelectShelter={setSelectedId} />
    </section>}
    {shelters.isPending && !offline && <Loading label="Loading shelters" />}
    <ErrorNotice error={shelters.error} />
    {selected && <section className="panel">
      <PanelTitle icon={<BedDouble size={18} />} title={selected.name} detail="Reservations and arrivals" actions={<Button disabled={offline || selected.available < 1} onClick={openReservation}><Plus size={17} /> Reserve spaces</Button>} />
      <div className="panel-body">
        {reservations.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Reservation</th><th>Incident</th><th>People</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {reservations.data.map((entry) => <tr key={entry.id}>
            <td className="mono">{entry.id.slice(0, 8)}</td><td>{incidents.data?.find((item) => item.id === entry.incidentId)?.summary ?? (entry.incidentId ? entry.incidentId.slice(0, 8) : 'Walk-in')}</td><td>{entry.people}</td>
            <td><span className={'tag ' + (entry.status === 'ADMITTED' ? 'tag-green' : 'tag-medium')}>{entry.status === 'ADMITTED' ? 'Admitted' : 'Reserved'}</span></td>
            <td>{entry.status === 'RESERVED' && <Button variant="outline" size="sm" disabled={admit.isPending || offline} onClick={() => admit.mutate(entry.id)}><CircleCheck size={15} /> Check in</Button>}</td>
          </tr>)}
        </tbody></table></div> : reservations.isPending && !offline ? <Loading label="Loading reservations" /> : <Empty>{offline ? 'Reservation records load when connected.' : 'No reservations at this shelter.'}</Empty>}
        <ErrorNotice error={reservations.error ?? admit.error} />
        {admit.isSuccess || reserve.isSuccess ? <div className="notice notice-success" role="status"><CircleCheck size={17} /> {admit.isSuccess ? 'Arrival recorded.' : 'Reservation saved.'}</div> : null}
      </div>
    </section>}
    <Modal open={reservationOpen} onOpenChange={setReservationOpen} title="Reserve shelter spaces" description={selected ? selected.available + ' places available at ' + selected.name + '.' : 'Choose the required number of spaces.'}>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); reserve.mutate() }}>
        <label className="field-label"><span><Link2 size={15} aria-hidden="true" /> Link to an incident</span><select value={incidentId} onChange={(event) => {
          setIncidentId(event.target.value)
          setPeople(incidents.data?.find((item) => item.id === event.target.value)?.people ?? 1)
        }}><option value="">Walk-in reservation</option>{incidents.data?.filter((item) => item.status !== 'RESOLVED').map((item) => <option key={item.id} value={item.id}>{item.summary} · {item.nodeId}</option>)}</select></label>
        {incidentId && recommendations.isPending && !offline && <Loading label="Checking reachable shelters" />}
        {recommended && <div className="route-summary"><Route size={17} /><div><strong>{recommended.shelter.name}</strong><small>Recommended · {recommended.route.travelMinutes.toFixed(1)} simulated minutes · {recommended.shelter.available} spaces</small></div>{recommended.shelter.id !== id && <Button variant="outline" size="sm" disabled={reserve.isPending} onClick={() => { setSelectedId(recommended.shelter.id); setSearch(''); setFilter(''); setClientId(uuid()); reserve.reset() }}>Use shelter</Button>}</div>}
        {incidentId && recommendations.data && !recommended && <p className="muted small">No reachable shelter suits this incident and headcount.</p>}
        <ErrorNotice error={recommendations.error} />
        <label className="field-label"><span><UsersRound size={15} aria-hidden="true" /> Places to reserve</span><input type="number" min="1" max={Math.min(200, selected?.available ?? 0)} required value={people || ''} onChange={(event) => setPeople(Number(event.target.value))} /></label>
        <ErrorNotice error={reserve.error} />
        <div className="modal-actions"><Button variant="outline" onClick={() => setReservationOpen(false)}>Cancel</Button><Button type="submit" disabled={reserve.isPending || offline}>Confirm reservation</Button></div>
      </form>
    </Modal>
  </>
}
