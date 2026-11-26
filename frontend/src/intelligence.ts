import { useQuery } from '@tanstack/react-query'
import { request } from './api'
import { useNetwork } from './network'
import type { Coordinates, Hazard, Incident, IncidentStatus, Severity, Shelter, TimelineEvent, Unit } from './types'

export type Count = { key: string; value: number }
export type ActivityPoint = { bucket: string; reported: number; resolved: number }
export type ResponsePoint = { bucket: string; dispatch: number | null; arrival: number | null; resolution: number | null }
export type Summary = {
  active: number; critical: number; people: number; resolved: number; availableUnits: number; busyUnits: number
  missions: number; occupied: number; reserved: number; availablePlaces: number; capacity: number
  blockedRoads: number; medianDispatch: number | null
}
export type Dashboard = {
  generatedAt: string; since: string; bucketSeconds: number; summary: Summary
  activity: ActivityPoint[]; response: ResponsePoint[]; severity: Count[]; categories: Count[]; lifecycle: Count[]
  hourly: number[]; units: Unit[]; shelters: Shelter[]; recent: TimelineEvent[]; critical: Incident[]
  mapIncidents: (Coordinates & { id: string; summary: string; severity: Severity })[]
}
export type IncidentPage = { items: Incident[]; total: number; page: number; pages: number }
export type IncidentFilters = { q?: string; severity?: Severity; hazard?: Hazard; status?: IncidentStatus; start?: string; end?: string; sort?: string; page?: string }

export const periodOptions = [1, 6, 24, 48] as const
export type Period = typeof periodOptions[number]
export const severityValues: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
export const hazardValues: Hazard[] = ['FLOOD', 'MEDICAL', 'LANDSLIDE', 'INFRASTRUCTURE', 'OTHER']
export const statusValues: IncidentStatus[] = ['REPORTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVED']

export function useDashboard(hours: Period) {
  const { offline, live } = useNetwork()
  return useQuery({
    queryKey: ['dashboard', hours],
    queryFn: () => request<Dashboard>('COORDINATOR', '/dashboard?hours=' + hours),
    enabled: !offline,
    refetchInterval: !offline && !live ? 20_000 : false,
  })
}

export function queryString(filters: IncidentFilters & { id?: string }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const query = params.toString()
  return query ? '?' + query : ''
}

export function useIncidents(filters: IncidentFilters) {
  const { offline, live } = useNetwork()
  const query = queryString(filters)
  return useQuery({
    queryKey: ['dashboard-incidents', query],
    queryFn: () => request<IncidentPage>('COORDINATOR', '/dashboard/incidents' + query),
    enabled: !offline,
    refetchInterval: !offline && !live ? 20_000 : false,
  })
}

export function useIncident(id: string) {
  const { offline } = useNetwork()
  return useQuery({
    queryKey: ['dashboard-incident', id],
    queryFn: () => request<Incident>('COORDINATOR', '/dashboard/incidents/' + encodeURIComponent(id)),
    enabled: Boolean(id) && !offline,
  })
}

export const exerciseTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
export const exerciseDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
export const eventName = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
export const compactId = (value: string) => value.slice(0, 8).toUpperCase()
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function chartTime(value: string) {
  const date = new Date(value)
  return exerciseDate.format(date) + ', ' + exerciseTime.format(date)
}

function csvCell(value: string | number | null) {
  const text = String(value ?? '')
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}

export function downloadCsv(name: string, columns: string[], rows: (string | number | null)[][]) {
  const content = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name + '.csv'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
