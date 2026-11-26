import { useQuery } from '@tanstack/react-query'
import { Ambulance, ArrowRight, ArrowUpRight, Construction, Crosshair, Droplets, FlaskConical, HousePlus, MapPinned, Radio, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { OperatingMap } from '../components/Map'
import { Empty, ErrorNotice, Loading, PanelTitle } from '../components/ui'
import { useNetwork } from '../network'

const actions = [
  { title: 'Send a practice SOS', copy: 'Report a fictional emergency. It stays on this device through an outage and sends when you reconnect.', icon: Siren, route: '/sos' },
  { title: 'Update a rescue mission', copy: 'Check the route and mark when the team leaves, arrives, or finishes the rescue.', icon: Radio, route: '/responder' },
  { title: 'Find space at a shelter', copy: 'See which shelters have room, reserve places, and check people in when they arrive.', icon: HousePlus, route: '/shelters' },
]

export function Overview() {
  const { offline } = useNetwork()
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled: !offline })
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled: !offline })
  const open = incidents.data?.filter((incident) => incident.status !== 'RESOLVED')
  const available = units.data?.filter((unit) => unit.status === 'AVAILABLE')
  const metrics = [
    { icon: Siren, label: 'Open SOS reports', value: open?.length },
    { icon: Ambulance, label: 'Units available', value: available?.length },
    { icon: Construction, label: 'Roads closed', value: graph.data?.blockedRoadIds.length },
  ]
  return <>
    <section className="overview-hero" aria-labelledby="overview-title">
      <img className="hero-image" src="/hydrogrid-aerial.webp" alt="" fetchPriority="high" />
      <div className="hero-content">
        <div className="hero-label"><Droplets size={17} aria-hidden="true" /> Flood response simulator</div>
        <h1 id="overview-title">Coordinate rescues <span>through the storm.</span></h1>
        <p>Test how a city responds when roads flood and networks fail. Practice sending an SOS, dispatch a rescue, and see how different decisions change the outcome.</p>
        <div className="hero-actions">
          <Link className="button button-lime button-lg" to="/command"><Crosshair size={18} aria-hidden="true" /> Open command center</Link>
          <Link className="button button-dark-outline button-lg" to="/live"><MapPinned size={18} aria-hidden="true" /> Explore live Bengaluru</Link>
          <Link className="button button-dark-outline button-lg" to="/simulation"><FlaskConical size={18} aria-hidden="true" /> Run a simulation</Link>
        </div>
      </div>
      <p className="hero-scene-caption"><MapPinned size={15} aria-hidden="true" /> Fictional flood scene inspired by Bengaluru</p>
    </section>

    <section className="overview-paths" aria-labelledby="overview-paths-heading">
      <h2 id="overview-paths-heading">Take part in the exercise</h2>
      <div className="overview-links">
        {actions.map(({ title, copy, icon: Icon, route }) => <Link to={route} className="feature-card panel" key={route}>
          <div className="feature-top"><span className="metric-icon"><Icon size={21} aria-hidden="true" /></span><ArrowUpRight size={19} aria-hidden="true" /></div>
          <h3>{title}</h3><p>{copy}</p>
        </Link>)}
      </div>
    </section>

    <section className="overview-map-panel hero-visual panel" aria-label="Exercise operating map">
      <PanelTitle icon={<MapPinned size={18} />} title="Exercise operating map" detail="Fictional road network and response activity in your workspace" />
      <ul className="hero-proof">
        {metrics.map(({ icon: Icon, label, value }) => <li className="hero-proof-item" key={label}>
          <Icon size={18} aria-hidden="true" /><div><small>{label}</small><strong>{value ?? '—'}</strong></div>
        </li>)}
      </ul>
      {graph.data ? <OperatingMap graph={graph.data} incidents={open} units={units.data} className="overview-map" /> : offline ? <Empty>The road graph loads when HydroGrid is reachable.</Empty> : graph.isError ? <ErrorNotice error={graph.error} /> : <Loading label="Loading operating map" />}
      <div className="hero-visual-footer"><Link className="text-link" to="/command">Open full command map <ArrowRight size={16} aria-hidden="true" /></Link></div>
    </section>
  </>
}
