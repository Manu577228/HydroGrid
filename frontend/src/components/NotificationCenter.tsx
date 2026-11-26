import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Bell, Check, CircleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, client, getSession } from '../api'
import { useNetwork } from '../network'
import type { QueueRecord, Simulation, TimelineEvent } from '../types'
import { Button, Modal, timestamp } from './ui'

type NoticeKind = 'Incidents' | 'Missions' | 'Shelters' | 'Connection' | 'Simulation'
type Notice = { id: string; title: string; detail: string; at?: string | number; href: string; kind: NoticeKind; toast?: boolean }

const activity: Record<string, { title: string; kind: NoticeKind; href: string; toast?: boolean }> = {
  SOS_REPORTED: { title: 'SOS reported', kind: 'Incidents', href: '/incidents' },
  TRIAGE_OVERRIDDEN: { title: 'Severity reviewed', kind: 'Incidents', href: '/incidents' },
  UNIT_DISPATCHED: { title: 'Mission assigned', kind: 'Missions', href: '/responder', toast: true },
  MISSION_EN_ROUTE: { title: 'Mission en route', kind: 'Missions', href: '/responder' },
  MISSION_ON_SCENE: { title: 'Responder on scene', kind: 'Missions', href: '/responder' },
  MISSION_RESOLVED: { title: 'Mission completed', kind: 'Missions', href: '/responder' },
  SHELTER_RESERVED: { title: 'Shelter spaces reserved', kind: 'Shelters', href: '/shelters' },
  SHELTER_ADMITTED: { title: 'Shelter admission confirmed', kind: 'Shelters', href: '/shelters', toast: true },
}

function readIds(key: string): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (Array.isArray(ids)) return new Set(ids.filter((id) => typeof id === 'string'))
  } catch { /* use in-memory state */ }
  return new Set()
}

function noticeFor(event: TimelineEvent, critical: Set<string>): Notice[] {
  const match = activity[event.type]
  if (!match) return []
  const urgent = event.type === 'SOS_REPORTED' && critical.has(event.incidentId)
  const href = !event.incidentId ? match.href : match.kind === 'Incidents'
    ? match.href + '?id=' + event.incidentId : match.kind === 'Missions'
      ? match.href + '?mission=' + event.incidentId : match.href
  return [{ ...match, id: event.id, title: urgent ? 'Critical SOS' : match.title,
    detail: event.detail, href, at: event.createdAt, toast: urgent || match.toast }]
}

export function NotificationCenter({ queue }: { queue: QueueRecord[] }) {
  const { offline, live } = useNetwork()
  const key = 'hydrogrid-notifications-' + getSession()
  const [read, setRead] = useState(() => readIds(key))
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [unreadOnly, showUnreadOnly] = useState(false)
  const [restored, setRestored] = useState<number>()
  const [toast, setToast] = useState<Notice>()
  const previousIds = useRef<Set<string> | undefined>(undefined)
  const lastConnection = useRef({ offline, live })
  const interrupted = useRef(false)
  const fallback = !offline && !live ? 30_000 : false
  const audit = useQuery({ queryKey: ['audit'], queryFn: api.audit, enabled: !offline, refetchInterval: fallback })
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled: !offline, refetchInterval: fallback })
  const shelters = useQuery({ queryKey: ['shelters'], queryFn: api.shelters, enabled: !offline, refetchInterval: fallback })
  const simulation = useQuery<Simulation>({ queryKey: ['simulation', 'latest'], queryFn: () => client.getQueryData(['simulation', 'latest'])!, enabled: false })

  useEffect(() => {
    const previous = lastConnection.current
    if (previous.live && !live) interrupted.current = true
    if ((previous.offline && !offline) || (interrupted.current && live)) {
      const now = Date.now()
      setRestored((existing) => existing && now - existing < 15_000 ? existing : now)
    }
    if (live) interrupted.current = false
    lastConnection.current = { offline, live }
  }, [live, offline])

  const notices = useMemo(() => {
    const critical = new Set(incidents.data?.filter((incident) => incident.severity === 'CRITICAL').map((incident) => incident.id))
    const rows = (audit.data ?? []).flatMap((event) => noticeFor(event, critical))
    for (const item of queue) {
      if (item.status === 'failed') rows.push({ id: 'delivery-' + item.clientId,
        title: item.kind === 'report' ? 'SOS delivery failed' : 'Mission update failed',
        detail: item.error ?? 'This update did not reach the server.', at: item.createdAt,
        href: item.kind === 'report' ? '/sos' : '/responder', kind: 'Connection', toast: true })
    }
    for (const item of shelters.data ?? []) {
      const used = item.admitted + item.reserved
      if (item.capacity === 0 || used / item.capacity < .85) continue
      rows.push({ id: 'shelter-capacity-' + item.id, title: 'Shelter nearing capacity',
        detail: item.name + ' · ' + item.available + ' places available',
        href: '/shelters?shelter=' + item.id, kind: 'Shelters' })
    }
    if (restored) rows.push({ id: 'connection-' + restored, title: 'Connection restored',
      detail: 'Queued updates can synchronize.', at: restored, href: '/sos', kind: 'Connection', toast: true })
    if (simulation.data) rows.push({ id: 'simulation-' + simulation.dataUpdatedAt, title: 'Simulation completed',
      detail: 'Seed ' + simulation.data.scenario.seed + ' · Compare FIFO and HydroGrid.',
      at: simulation.dataUpdatedAt, href: '/simulation', kind: 'Simulation', toast: true })
    return rows.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()).slice(0, 60)
  }, [audit.data, incidents.data, queue, restored, shelters.data, simulation.data, simulation.dataUpdatedAt])

  useEffect(() => {
    if (audit.isPending && !offline) return
    const ids = previousIds.current
    previousIds.current = new Set(notices.map((notice) => notice.id))
    if (!ids) return
    const added = notices.find((notice) => notice.toast && !ids.has(notice.id))
    if (added) setToast(added)
  }, [audit.isPending, notices, offline])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(undefined), 6_500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function mark(ids: string[], value: boolean) {
    setRead((current) => {
      const next = new Set(current)
      ids.forEach((id) => value ? next.add(id) : next.delete(id))
      try { localStorage.setItem(key, JSON.stringify([...next].slice(-200))) } catch { /* use in-memory state */ }
      return next
    })
  }

  const unread = notices.filter((notice) => !read.has(notice.id)).length
  const pending = queue.filter((item) => item.status === 'pending').length
  const filtered = notices.filter((notice) => (filter === 'all' || notice.kind === filter) && (!unreadOnly || !read.has(notice.id)))

  return <>
    <span className="notice-trigger-wrap">
      <Button variant="ghost" size="icon" className="notice-trigger" aria-label="Notifications" title={unread ? unread + ' unread notifications' : 'Notifications'}
        aria-expanded={open} onClick={() => setOpen(true)}><Bell size={18} aria-hidden="true" /></Button>
      {unread > 0 && <span className="notice-trigger-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </span>
    <Modal open={open} onOpenChange={setOpen} title="Notifications" description="Updates from the exercise and this device.">
      <div className="notification-controls">
        <select aria-label="Filter notifications" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All activity</option>
          {(['Incidents', 'Missions', 'Shelters', 'Connection', 'Simulation'] as const).map((kind) => <option key={kind}>{kind}</option>)}
        </select>
        <Button size="sm" variant={unreadOnly ? 'secondary' : 'outline'} aria-pressed={unreadOnly} onClick={() => showUnreadOnly(!unreadOnly)}>Unread</Button>
        <Button size="sm" variant="ghost" disabled={unread === 0} onClick={() => mark(notices.map((notice) => notice.id), true)}>
          <Check size={15} aria-hidden="true" /> Mark all as read
        </Button>
      </div>
      {pending > 0 && <div className="notification-pending"><CircleAlert size={15} /> {pending} {pending === 1 ? 'update' : 'updates'} waiting to sync. <Link to="/sos" onClick={() => setOpen(false)}>Delivery log</Link></div>}
      <ul className="notification-list">
        {filtered.map((notice) => <li key={notice.id} data-unread={!read.has(notice.id)}>
          <Link to={notice.href} onClick={() => { mark([notice.id], true); setOpen(false) }}>
            <span><strong>{notice.title}</strong>{notice.detail && <small>{notice.detail}</small>}</span><ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <div className="notification-meta">
            <span>{notice.kind}{notice.at ? ' · ' + timestamp(notice.at) : ''}</span>
            <button type="button" onClick={() => mark([notice.id], !read.has(notice.id))}>
              {read.has(notice.id) ? 'Mark unread' : 'Mark as read'}
            </button>
          </div>
        </li>)}
      </ul>
      {filtered.length === 0 && <p className="palette-feedback">{audit.isError && !audit.data ? 'Exercise activity is unavailable.' : 'No notifications match this view.'}</p>}
    </Modal>
    {toast && !open && <div className="shell-toast">
      <div role="status"><strong>{toast.title}</strong><small>{toast.detail}</small></div>
      <Link to={toast.href} aria-label="Open notification" onClick={() => setToast(undefined)}><ArrowUpRight size={16} /></Link>
      <button type="button" aria-label="Dismiss notification" onClick={() => setToast(undefined)}><X size={16} /></button>
    </div>}
  </>
}
