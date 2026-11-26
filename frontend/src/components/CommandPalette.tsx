import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ClipboardList, HousePlus, Radio, Search, Truck, type LucideIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useNetwork } from '../network'
import { Modal, hazardLabels, statusLabels } from './ui'

export type SearchPage = { href: string; label: string; icon: LucideIcon }
type Result = SearchPage & { id: string; group: string; subtitle?: string; keywords?: string }

export function CommandPalette({ open, onOpenChange, pages, exercise }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: SearchPage[]
  exercise: boolean
}) {
  const { offline } = useNetwork()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState(-1)
  const search = useDeferredValue(input.trim().toLowerCase())
  const enabled = open && exercise && !offline
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: () => api.incidents(), enabled })
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.units(), enabled })
  const shelters = useQuery({ queryKey: ['shelters'], queryFn: api.shelters, enabled })

  const results = useMemo(() => {
    const all: Result[] = pages.map((page) => ({ ...page, id: page.href, group: 'Pages' }))
    if (exercise) {
      for (const incident of incidents.data ?? []) {
        const identity = incident.id + ' ' + incident.nodeId
        const details = hazardLabels[incident.hazard] + ' · ' + statusLabels[incident.status]
        all.push({ id: 'incident-' + incident.id, label: incident.summary, subtitle: details, keywords: identity,
          href: '/incidents?id=' + incident.id, icon: ClipboardList, group: 'Incidents' })
        if (incident.assignedUnitId) all.push({ id: 'mission-' + incident.id, label: incident.summary,
          subtitle: statusLabels[incident.status], keywords: identity + ' ' + incident.assignedUnitId,
          href: '/responder?mission=' + incident.id, icon: Radio, group: 'Missions' })
      }
      for (const unit of units.data ?? []) all.push({ id: unit.id, label: unit.name, subtitle: unit.status === 'AVAILABLE' ? 'Available' : 'Busy',
        keywords: unit.nodeId, href: '/units?id=' + unit.id, icon: Truck, group: 'Rescue units' })
      for (const shelter of shelters.data ?? []) all.push({ id: shelter.id, label: shelter.name,
        subtitle: shelter.available + ' exercise places available', keywords: shelter.type,
        href: '/shelters?shelter=' + shelter.id, icon: HousePlus, group: 'Shelters' })
    }
    if (!search) return all.filter((row) => row.group === 'Pages').slice(0, 9)
    return all.filter((row) => search.split(/\s+/).every((part) =>
      [row.label, row.subtitle, row.keywords, row.group, row.id].join(' ').toLowerCase().includes(part),
    )).slice(0, 32)
  }, [exercise, incidents.data, pages, search, shelters.data, units.data])
  const groups = [...new Set(results.map((row) => row.group))]
  const busy = enabled && (incidents.isLoading || units.isLoading || shelters.isLoading)
  const requestFailed = enabled && (incidents.isError || units.isError || shelters.isError)

  function close() {
    onOpenChange(false)
    setInput('')
    setSelected(-1)
  }

  function activate(result: Result) {
    close()
    navigate(result.href)
  }

  return <Modal open={open} onOpenChange={(value) => value ? onOpenChange(true) : close()} title="Search HydroGrid" initialFocus={inputRef}
    description={exercise ? 'Search this exercise for incidents, units, shelters, missions and pages.' : 'Find public pages and open the Bengaluru exercise.'}>
    <div className="palette-input">
      <Search size={18} aria-hidden="true" />
      <input type="search" ref={inputRef} aria-label="Search workspace" value={input} placeholder={exercise ? 'Search names, IDs or destinations' : 'Search pages'}
        onChange={(event) => { setInput(event.target.value); setSelected(-1) }}
        onKeyDown={(event) => {
          if (results.length === 0) return
          if (event.key === 'Enter') { event.preventDefault(); activate(results[Math.max(0, selected)]); return }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          const next = selected < 0 && event.key === 'ArrowUp' ? results.length - 1
            : (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
          setSelected(next)
          document.getElementById('search-result-' + results[next].id)?.scrollIntoView({ block: 'nearest' })
        }} />
    </div>
    <div className="palette-results">
      {groups.map((group) => <section key={group} aria-label={group}><h3>{group}</h3>
        {results.filter((row) => row.group === group).map((row) => <Link id={'search-result-' + row.id}
          className={results[selected]?.id === row.id ? 'palette-item palette-selected' : 'palette-item'}
          key={row.id} to={row.href} onClick={close}>
          <row.icon size={16} aria-hidden="true" />
          <span><strong>{row.label}</strong>{row.subtitle && <small>{row.subtitle}</small>}</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>)}
      </section>)}
      {results.length === 0 && !busy && <p className="palette-feedback">No results for that search.</p>}
    </div>
    {(busy || requestFailed || exercise && offline) && <p className="palette-feedback" role="status">
      {busy ? 'Loading workspace records…' : offline ? 'Offline. Search uses the records already loaded on this device.' : 'Some workspace records are unavailable.'}
    </p>}
    <div className="palette-footer"><span><kbd>↑ ↓</kbd> Select</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
  </Modal>
}
