import {
  Activity, ArrowUpRight, Bell, ChevronDown, CircleHelp, Droplets, FlaskConical, Home,
  HousePlus, LayoutDashboard, MapPinned, Menu, Radio, ShieldCheck, Siren, Wifi, WifiOff, X,
} from 'lucide-react'
import { type PropsWithChildren, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useNetwork } from '../network'
import { useQueue } from '../offline'
import { Button, cn } from './ui'

const links = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/command', label: 'Command center', icon: LayoutDashboard },
  { href: '/live', label: 'Live Bengaluru', icon: MapPinned },
  { href: '/sos', label: 'Citizen SOS', icon: Siren },
  { href: '/responder', label: 'Responder console', icon: Radio },
  { href: '/shelters', label: 'Shelters', icon: HousePlus },
  { href: '/simulation', label: 'Simulation lab', icon: FlaskConical },
  { href: '/analytics', label: 'Analytics & audit', icon: Activity },
]

export function Shell({ children }: PropsWithChildren) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [networkOpen, setNetworkOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const { offline, simulated, live, setSimulated } = useNetwork()
  const queue = useQueue()
  const pending = queue.filter((action) => action.status === 'pending').length
  const current = links.find((link) => link.href === location.pathname)
  return <div className="shell">
    {mobileOpen && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={cn('sidebar', mobileOpen && 'sidebar-open')} aria-label="Workspace sidebar">
      <Link to="/" className="brand" onClick={() => setMobileOpen(false)}>
        <span className="brand-mark"><Droplets size={23} strokeWidth={2.2} /></span>
        <span><strong>HydroGrid</strong><small>DISASTER RESPONSE</small></span>
      </Link>
      <div className="nav-heading">Workspace</div>
      <nav aria-label="Primary navigation">
        {links.map(({ href, label, icon: Icon }) => <NavLink end to={href} key={href} onClick={() => setMobileOpen(false)} className={({ isActive }) => cn('nav-link', isActive && 'nav-active')}>
          <span className="nav-icon" aria-hidden="true"><Icon size={17} strokeWidth={1.9} /></span><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="sidebar-foot">
        <div className="sidebar-about"><CircleHelp size={16} /><div><strong>Simulation workspace</strong><p>Use fictional reports and locations on the demo map.</p></div></div>
        <Link className="sidebar-shortcut" to="/simulation" onClick={() => setMobileOpen(false)}>Open scenario controls <ArrowUpRight size={14} /></Link>
      </div>
    </aside>
    <div className="main-layout">
      <div className="topbar">
        <div className="topbar-context">
          <Button variant="ghost" size="icon" className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={19} /> : <Menu size={19} />}</Button>
          <span className="topbar-workspace">HydroGrid workspace</span><span className="topbar-divider">/</span><strong>{current?.label ?? 'Overview'}</strong>
        </div>
        <div className="topbar-actions">
          <div className="popover-anchor">
            <button className={cn('network-chip', offline && 'network-chip-offline', live && !offline && 'network-chip-live')} aria-expanded={networkOpen} onClick={() => { setNetworkOpen(!networkOpen); setAlertsOpen(false) }}>
              {offline ? <WifiOff size={15} /> : <Wifi size={15} />}<span>{offline ? 'Offline' : live ? 'Live updates' : 'Connecting'}</span><ChevronDown size={13} />
            </button>
            {networkOpen && <div className="popover">
              <strong>Demo connection</strong><p>{offline ? 'Reports and mission updates are stored on this device.' : 'Reports and mission updates sync when the server is reachable.'}</p>
              <label className="toggle-row"><input type="checkbox" checked={simulated} onChange={(event) => setSimulated(event.target.checked)} />Simulate offline</label>
            </div>}
          </div>
          <div className="popover-anchor">
            <Button variant="ghost" size="icon" className="bell-button" aria-label="Sync notifications" aria-expanded={alertsOpen} onClick={() => { setAlertsOpen(!alertsOpen); setNetworkOpen(false) }}><Bell size={18} />{pending > 0 && <span className="bell-dot" />}</Button>
            {alertsOpen && <div className="popover"><strong>Sync notifications</strong><p>{pending ? String(pending) + ' action' + (pending === 1 ? ' is' : 's are') + ' waiting to sync.' : 'No actions waiting to sync.'}</p><Link className="text-link" to="/sos" onClick={() => setAlertsOpen(false)}>View delivery log <ArrowUpRight size={14} /></Link></div>}
          </div>
          <div className="role-avatar" title="Synthetic demonstration workspace"><ShieldCheck size={17} aria-hidden="true" /></div>
        </div>
      </div>
      <main id="main" className="page">{children}</main>
    </div>
  </div>
}
