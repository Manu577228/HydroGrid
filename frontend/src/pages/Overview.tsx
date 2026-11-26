import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, Crosshair, FlaskConical, GitCompareArrows, MapPinned, RadioTower, Route, Siren, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { OperatingMap } from '../components/Map'
import { Empty, ErrorNotice, Loading, PanelTitle } from '../components/ui'
import { useNetwork } from '../network'

const capabilities = [
  { title: 'Coordinate rescues', copy: 'Triage incidents, match available units and trace the response from report to rescue.', icon: Crosshair, route: '/command' },
  { title: 'Report through outages', copy: 'Save a synthetic SOS on this device. HydroGrid sends it when the connection returns.', icon: WifiOff, route: '/sos' },
  { title: 'Compare dispatch strategies', copy: 'Run FIFO and HydroGrid on one seeded scenario and see how both perform.', icon: GitCompareArrows, route: '/simulation' },
]

export function Overview() {
  const { offline } = useNetwork()
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled: !offline })
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled: !offline })
  const open = incidents.data?.filter((incident) => incident.status !== 'RESOLVED') ?? []
  return <>
    <section className="overview-hero">
      <div className="hero-content">
        <div className="hero-label"><RadioTower size={15} /> Disaster response simulation</div>
        <h1>Coordinate rescues when the network goes down.</h1>
        <p>HydroGrid queues emergency reports through outages, routes responders around simulated floods, and helps coordinators decide which unit to send.</p>
        <div className="hero-actions">
          <Link className="button button-lime button-lg" to="/command">Open command center <ArrowRight size={18} /></Link>
          <Link className="button button-dark-outline button-lg" to="/simulation"><FlaskConical size={17} /> Run a simulation</Link>
        </div>
      </div>
      <div className="hero-visual panel">
        <PanelTitle icon={<MapPinned size={17} />} title="Operating map" detail="Bengaluru, synthetic network" />
        {graph.data ? <OperatingMap graph={graph.data} incidents={open} units={units.data} className="overview-map" /> : offline ? <Empty>The road graph loads when HydroGrid is reachable.</Empty> : graph.isError ? <ErrorNotice error={graph.error} /> : <Loading label="Loading operating map" />}
        <div className="hero-visual-footer"><Route size={15} /> {graph.data ? graph.data.blockedRoadIds.length + ' simulated roads blocked' : 'Hazard-aware routes'}<Link to="/command" aria-label="Open operating map"><ArrowUpRight size={16} /></Link></div>
      </div>
    </section>
    <section className="overview-links" aria-label="HydroGrid capabilities">
      {capabilities.map(({ title, copy, icon: Icon, route }) => <Link to={route} className="feature-card panel" key={route}>
        <div className="feature-top"><span className="metric-icon"><Icon size={21} /></span><ArrowUpRight size={19} /></div>
        <h2>{title}</h2><p>{copy}</p>
      </Link>)}
    </section>
    <div className="notice"><Siren size={18} /> HydroGrid is a competition prototype. Use fictional data and treat every route as a simulation.</div>
  </>
}
