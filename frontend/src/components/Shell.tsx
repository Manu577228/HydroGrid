import * as Dialog from '@radix-ui/react-dialog'
import {
  Activity, ArrowRight, ChevronDown, ChevronRight, ClipboardList, CloudUpload, Command, Droplets, FlaskConical, Home,
  HousePlus, LayoutDashboard, LogOut, MapPinned, Maximize2, Menu, Minimize2, Monitor, Moon, PanelLeftClose, PanelLeftOpen,
  Radio, Search, Settings, ShieldCheck, Siren, SquareActivity, Sun, Truck, UserRound, Wifi, WifiOff, X, type LucideIcon,
} from 'lucide-react'
import { lazy, type MouseEvent, type PropsWithChildren, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAccount } from '../account'
import { useNetwork } from '../network'
import { useQueue } from '../offline'
import { type ThemePreference, useTheme } from '../theme'
import type { SearchPage } from './CommandPalette'
import { Button, cn } from './ui'
import '../platform.css'

const CommandPalette = lazy(() => import('./CommandPalette').then((module) => ({ default: module.CommandPalette })))
const NotificationCenter = lazy(() => import('./NotificationCenter').then((module) => ({ default: module.NotificationCenter })))

type NavigationGroup = { label: string; links: SearchPage[] }

const overview: SearchPage = { href: '/', label: 'Overview', icon: Home }
const dashboard: SearchPage = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }
const liveMap: SearchPage = { href: '/live', label: 'Live Bengaluru', icon: MapPinned }
const city: SearchPage = { href: '/operations', label: 'City operations', icon: SquareActivity }
const practice: SearchPage = { href: '/sos', label: 'Citizen SOS', icon: Siren }
const profile: SearchPage = { href: '/profile', label: 'Account settings', icon: Settings }
const exerciseNavigation: NavigationGroup[] = [
  { label: 'Overview', links: [overview, dashboard, liveMap, city] },
  { label: 'Response operations', links: [
    { href: '/command', label: 'Command center', icon: LayoutDashboard },
    { href: '/incidents', label: 'Incident management', icon: ClipboardList },
    { href: '/units', label: 'Rescue units', icon: Truck },
    practice,
    { href: '/responder', label: 'Responder console', icon: Radio },
    { href: '/shelters', label: 'Shelters', icon: HousePlus },
  ] },
  { label: 'Intelligence', links: [
    { href: '/analytics', label: 'Analytics & audit', icon: Activity },
    { href: '/simulation', label: 'Simulation lab', icon: FlaskConical },
  ] },
]
const publicSearch: SearchPage[] = [overview, liveMap, city, dashboard, practice]
const exerciseSearch = exerciseNavigation.flatMap((group) => group.links)
const publicPaths = new Set(['/', '/live', '/operations', '/register', '/login', '/profile'])
const themeChoices: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function closeFlyout(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest('details')?.removeAttribute('open')
}

function Brand({ onClick }: { onClick?: () => void }) {
  return <Link className="platform-brand" to="/" aria-label="HydroGrid home" onClick={onClick}>
    <span className="platform-brand-mark"><Droplets size={20} aria-hidden="true" /></span>
    <span className="platform-brand-name">HydroGrid</span>
  </Link>
}

function Navigation({ close }: { close?: () => void }) {
  const { pathname } = useLocation()
  return <nav aria-label="Primary navigation" className="platform-navigation">
    {exerciseNavigation.map((group) => <div className="platform-nav-group" key={group.label}>
      <span className="platform-nav-heading">{group.label}</span>
      <div>
        {group.links.map(({ href, label, icon: Icon }) => <NavLink className={({ isActive }) => cn('platform-nav-link', isActive && 'platform-nav-active')}
          to={href} end key={href} aria-label={label} title={label} onClick={href === pathname ? close : undefined}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>)}
      </div>
    </div>)}
  </nav>
}

function ThemeSwitch({ preference, selectTheme }: ReturnType<typeof useTheme>) {
  const Icon = themeChoices.find((choice) => choice.value === preference)?.icon ?? Monitor
  return <details className="platform-menu"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
    <summary className="platform-icon-button" aria-label="Theme" title="Theme"><Icon size={17} aria-hidden="true" /></summary>
    <div className="platform-flyout">
      <strong>Appearance</strong>
      {themeChoices.map(({ icon: Choice, label, value }) => <button type="button" className="platform-menu-item" key={value} aria-pressed={preference === value}
        onClick={(event) => { selectTheme(value); event.currentTarget.closest('details')?.querySelector('summary')?.focus(); closeFlyout(event) }}>
        <Choice size={16} aria-hidden="true" /> {label}{preference === value && <span className="platform-selected-dot" aria-hidden="true" />}
      </button>)}
    </div>
  </details>
}

function WorkspaceSwitch() {
  return <details className="platform-menu platform-workspace"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
    <summary>
      <div className="platform-workspace-mark"><MapPinned size={17} aria-hidden="true" /></div>
      <span><strong>Bengaluru</strong><small>Exercise workspace</small></span>
      <ChevronDown size={13} aria-hidden="true" />
    </summary>
    <div className="platform-flyout platform-flyout-left">
      <strong>Open workspace</strong>
      <Link className="platform-menu-item" to="/dashboard" onClick={closeFlyout}><LayoutDashboard size={16} /> Bengaluru exercise</Link>
      <Link className="platform-menu-item" to="/live" onClick={closeFlyout}><MapPinned size={16} /> Public city map</Link>
      <Link className="platform-menu-item" to="/operations" onClick={closeFlyout}><ShieldCheck size={16} /> City operations</Link>
      <Link className="platform-menu-item" to="/simulation" onClick={closeFlyout}><FlaskConical size={16} /> Scenario settings</Link>
    </div>
  </details>
}

function AccountMenu({ exercise }: { exercise: boolean }) {
  const account = useAccount()
  const navigate = useNavigate()
  const [notice, setNotice] = useState('')
  const signedIn = account.status === 'signedIn'
  return <details className="platform-menu platform-account"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
    <summary className="platform-icon-button" aria-label="Account menu" title="Account menu">
      {signedIn && account.profile?.displayName ? <span className="platform-account-initial">{account.profile.displayName[0].toUpperCase()}</span> : <UserRound size={17} aria-hidden="true" />}
    </summary>
    <div className="platform-flyout">
      <strong>{signedIn ? account.profile?.displayName ?? 'Citizen account' : exercise ? 'Demo participant' : 'HydroGrid account'}</strong>
      {signedIn && <p className="platform-account-detail">Citizen account</p>}
      {signedIn ? <>
        <Link className="platform-menu-item" to="/profile" onClick={closeFlyout}><Settings size={16} /> Account settings</Link>
        <button className="platform-menu-item" type="button" onClick={(event) => {
          closeFlyout(event)
          setNotice('')
          void account.signOut().then(() => navigate('/')).catch(() => setNotice('Sign-out failed. Please try again.'))
        }}><LogOut size={16} /> Sign out</button>
      </> : <>
        <Link className="platform-menu-item" to="/login" onClick={closeFlyout}><UserRound size={16} /> Sign in</Link>
        <Link className="platform-menu-item" to="/register" onClick={closeFlyout}><ShieldCheck size={16} /> Create account</Link>
      </>}
      {notice && <p className="platform-account-detail" role="alert">{notice}</p>}
    </div>
  </details>
}

function NetworkIndicator({ pending }: { pending: number }) {
  const { offline, simulated, live, setSimulated } = useNetwork()
  const Icon = offline ? WifiOff : Wifi
  const label = offline ? 'Offline' : live ? 'Live updates' : 'Connecting'
  return <details className="platform-menu platform-network"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
    onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
    <summary className={cn('platform-network-trigger', offline && 'platform-network-offline')} aria-label={label + ', connection and sync'} title={label}>
      <Icon size={15} aria-hidden="true" /><span>{label}</span>{pending > 0 && <small>{pending}</small>}
    </summary>
    <div className="platform-flyout">
      <strong>Exercise connection</strong>
      <p>{pending ? pending + (pending === 1 ? ' update waiting to sync' : ' updates waiting to sync') : offline ? 'New updates will be saved on this device.' : 'No updates waiting to sync.'}</p>
      <label className="platform-menu-item"><input type="checkbox" checked={simulated} onChange={(event) => setSimulated(event.target.checked)} /> Simulate offline</label>
      <Link className="platform-menu-item" to="/sos" onClick={closeFlyout}><CloudUpload size={16} /> Delivery log</Link>
    </div>
  </details>
}

export function Shell({ children }: PropsWithChildren) {
  const location = useLocation()
  const { status } = useAccount()
  const [drawerPath, setDrawerPath] = useState<string>()
  const mobileOpen = drawerPath === location.pathname
  const setMobileOpen = (open: boolean) => setDrawerPath(open ? location.pathname : undefined)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [compact, setCompact] = useState(() => localStorage.getItem('hydrogrid-sidebar') === 'compact')
  const [focus, setFocus] = useState(false)
  const focusTrigger = useRef<HTMLButtonElement>(null)
  const theme = useTheme()
  const queue = useQueue()
  const publicView = publicPaths.has(location.pathname)
  const home = location.pathname === '/'
  const current = exerciseNavigation.flatMap((group) => group.links.map((page) => ({ ...page, group: group.label })))
    .find((item) => item.href === location.pathname)
  const pages = publicView ? publicSearch : exerciseSearch
  const searchPages = status === 'signedIn' ? [...pages, profile] : pages
  const pending = queue.filter((action) => action.status === 'pending').length
  const commandView = location.pathname === '/command'
  const role = location.pathname === '/sos' ? 'Citizen'
    : location.pathname === '/responder' ? 'Responder' : location.pathname === '/shelters' ? 'Shelter manager' : 'Coordinator'

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((previous) => !previous)
      }
      if (event.key === 'Escape') setFocus(false)
    }
    const fullscreen = () => { if (!document.fullscreenElement) setFocus(false) }
    document.addEventListener('keydown', key)
    document.addEventListener('fullscreenchange', fullscreen)
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fullscreen) }
  }, [])

  useEffect(() => {
    if (!commandView) {
      setFocus(false)
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {})
    }
  }, [commandView])

  function toggleFocus() {
    if (focus) {
      setFocus(false)
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {})
      focusTrigger.current?.focus()
    } else {
      setFocus(true)
      if (document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const mobileButton = <Dialog.Trigger asChild><Button variant="ghost" size="icon" className="platform-mobile-trigger"
    aria-label="Open navigation"><Menu size={20} aria-hidden="true" /></Button></Dialog.Trigger>

  return <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}><div className={cn('platform', !publicView && 'platform-exercise', (compact || focus) && 'platform-compact', focus && 'platform-focus')}>
    <a className="platform-skip" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
    {!publicView && <aside className="platform-sidebar" aria-label="Workspace sidebar">
      <div className="platform-sidebar-head">
        <Brand />
        <Button variant="ghost" size="icon" className="platform-collapse" aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
          title={compact ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => {
            setCompact(!compact)
            try { localStorage.setItem('hydrogrid-sidebar', compact ? 'expanded' : 'compact') } catch { /* current state still applies */ }
          }}>{compact ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</Button>
      </div>
      <WorkspaceSwitch />
      <Navigation />
      <div className="platform-sidebar-footer"><span><ShieldCheck size={15} aria-hidden="true" /> Practice mode</span><small>Reports and dispatches here use fictional data.</small></div>
    </aside>}
    <Dialog.Portal>
      <Dialog.Overlay className="platform-drawer-overlay" />
      <Dialog.Content className="platform-drawer">
          <Dialog.Title className="sr-only">HydroGrid navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Public pages and the demonstration workspace.</Dialog.Description>
          <div className="platform-drawer-head"><Brand onClick={() => setMobileOpen(false)} />
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close navigation"><X size={19} /></Button></Dialog.Close>
          </div>
          <Navigation close={() => setMobileOpen(false)} />
          {status === 'signedIn' ? <Link className="platform-nav-link" to="/profile"><Settings size={16} /> Account settings</Link> :
            <Link className="platform-nav-link" to="/login"><UserRound size={16} /> Sign in</Link>}
      </Dialog.Content>
    </Dialog.Portal>
    <div className="platform-main">
      <header className={cn('platform-topbar', publicView && 'platform-public-topbar')}>
        {publicView ? <div className="platform-public-bar">
          <div className="platform-topbar-start">{mobileButton}<Brand /></div>
          <nav aria-label="Public pages" className="platform-public-links">
            <NavLink end to="/live">Live Bengaluru</NavLink>
            <NavLink end to="/operations">City operations</NavLink>
            <Link to="/sos">Practice SOS</Link>
          </nav>
          <div className="platform-tools">
            <ThemeSwitch {...theme} />
            {status === 'signedIn' ? <AccountMenu exercise={false} /> : <Link className="platform-public-signin" to="/login">Sign in</Link>}
            <Link className="button button-primary button-sm platform-open-demo" to="/dashboard">Open exercise <ArrowRight size={14} /></Link>
          </div>
        </div> : <>
          <div className="platform-topbar-start">{mobileButton}
            <nav aria-label="Breadcrumb" className="platform-breadcrumb">
              <Link to="/dashboard">{current?.group ?? 'Exercise'}</Link><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{current?.label ?? 'Workspace'}</span>
            </nav>
          </div>
          <div className="platform-tools">
            <span className="platform-search-wrap">
              <Button variant="ghost" className="platform-search-button" aria-label="Search workspace" aria-keyshortcuts="Control+K Meta+K" onClick={() => setPaletteOpen(true)}>
                <Search size={16} aria-hidden="true" /><span>Search</span>
              </Button>
              <kbd aria-hidden="true"><Command size={11} /> K</kbd>
            </span>
            <NetworkIndicator pending={pending} />
            <Suspense fallback={<span className="platform-notice-placeholder" aria-hidden="true" />}><NotificationCenter queue={queue} /></Suspense>
            <ThemeSwitch {...theme} />
            {commandView && <Button ref={focusTrigger} size="icon" variant="ghost" className="platform-focus-control" aria-label={focus ? 'Exit command focus' : 'Focus command center'} onClick={toggleFocus} title={focus ? 'Exit command focus' : 'Focus command center'}>
              {focus ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </Button>}
            <span className="platform-current-role">{role} · Practice</span><AccountMenu exercise />
          </div>
        </>}
      </header>
      <main id="main" tabIndex={-1} className={cn('page', home && 'platform-landing')}>{children}</main>
    </div>
    <Suspense fallback={null}>{paletteOpen && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={searchPages} exercise={!publicView} />}</Suspense>
  </div></Dialog.Root>
}
