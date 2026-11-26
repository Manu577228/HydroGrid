import { QueryClient } from '@tanstack/react-query'
import { Client } from '@stomp/stompjs'
import type {
  Cluster, Graph, Incident, IncidentInput, IncidentStatus, Recommendations, Reservation,
  Role, Route, Scenario, Severity, Shelter, Simulation, TimelineEvent, Unit,
} from './types'

export const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 12_000, refetchOnWindowFocus: true } },
})

const sessionStorageKey = 'hydrogrid-demo-session'

export function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

export function getSession() {
  const existing = localStorage.getItem(sessionStorageKey)
  if (existing) return existing
  const generated = uuid()
  localStorage.setItem(sessionStorageKey, generated)
  return generated
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const tokens = new Map<Role, string>()
const logins = new Map<Role, Promise<string>>()
let simulatedOffline = localStorage.getItem('hydrogrid-no-network') === 'true'

export function setSimulatedOffline(next: boolean) {
  simulatedOffline = next
  localStorage.setItem('hydrogrid-no-network', String(next))
  window.dispatchEvent(new Event('hydrogrid-network'))
}

export function isSimulatedOffline() { return simulatedOffline }

async function call<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (simulatedOffline) throw new ApiError(0, 'Demo connection is paused.')
  let response: Response
  try {
    const headers = new Headers(options.headers)
    if (options.body) headers.set('Content-Type', 'application/json')
    response = await fetch(url, { ...options, headers, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(8_000) })
  } catch {
    throw new ApiError(0, 'HydroGrid is unreachable.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(response.status, data?.detail ?? data?.message ?? data?.error ?? 'Request failed (' + response.status + ').')
  }
  return response.json() as Promise<T>
}

async function token(role: Role): Promise<string> {
  const existing = tokens.get(role)
  if (existing) return existing
  const inFlight = logins.get(role)
  if (inFlight) return inFlight
  const login = call<{ token: string }>('/api/auth/demo', {
    method: 'POST',
    headers: { 'X-Demo-Session': getSession() },
    body: JSON.stringify({ role }),
  }).then((result) => {
    tokens.set(role, result.token)
    return result.token
  }).finally(() => logins.delete(role))
  logins.set(role, login)
  return login
}

async function request<T>(role: Role, path: string, body?: unknown): Promise<T> {
  const send = async () => call<T>('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + await token(role) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  try {
    return await send()
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    tokens.delete(role)
    return send()
  }
}

export const api = {
  incidents: (role: Role = 'COORDINATOR') => request<Incident[]>(role, '/incidents'),
  report: (input: IncidentInput) => request<Incident>('CITIZEN', '/incidents', input),
  dispatch: (id: string, unitId?: string) => request<Incident>('COORDINATOR', '/incidents/' + id + '/dispatch', { unitId }),
  status: (id: string, clientId: string, status: IncidentStatus) => request<Incident>('RESPONDER', '/incidents/' + id + '/status', { clientId, status }),
  triage: (id: string, severity: Severity, reason: string) => request<Incident>('COORDINATOR', '/incidents/' + id + '/triage', { severity, reason }),
  recommendations: (id: string) => request<Recommendations>('COORDINATOR', '/incidents/' + id + '/recommendations'),
  timeline: (id: string) => request<TimelineEvent[]>('COORDINATOR', '/incidents/' + id + '/timeline'),
  audit: () => request<TimelineEvent[]>('COORDINATOR', '/audit'),
  clusters: () => request<Cluster[]>('COORDINATOR', '/clusters'),
  group: (incidentIds: string[]) => request<{ groupId: string }>('COORDINATOR', '/clusters', { incidentIds }),
  units: (role: Role = 'COORDINATOR') => request<Unit[]>(role, '/units'),
  graph: (role: Role = 'COORDINATOR') => request<Graph>(role, '/graph'),
  hazards: (intensity: number) => request<Graph>('COORDINATOR', '/hazards', { intensity }),
  route: (from: string, to: string) => request<Route>('RESPONDER', '/routes?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)),
  shelters: () => request<Shelter[]>('SHELTER', '/shelters'),
  shelterRecommendations: (incidentId: string) => request<{ shelter: Shelter; route: Route }[]>('SHELTER', '/shelters/recommendations?incidentId=' + encodeURIComponent(incidentId)),
  reservations: (id: string) => request<Reservation[]>('SHELTER', '/shelters/' + id + '/reservations'),
  reserve: (id: string, input: { clientId: string; incidentId?: string; people: number }) => request<Reservation>('SHELTER', '/shelters/' + id + '/reservations', input),
  admit: (id: string, reservationId: string) => request<Reservation>('SHELTER', '/shelters/' + id + '/reservations/' + reservationId + '/admit', {}),
  simulation: (scenario: Scenario) => request<Simulation>('COORDINATOR', '/simulation', scenario),
}

export function liveUpdates(onChange: (connected: boolean) => void) {
  if (isSimulatedOffline() || !navigator.onLine) return () => {}
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const connection = new Client({
    brokerURL: protocol + '//' + location.host + '/ws',
    reconnectDelay: 5_000,
    connectionTimeout: 8_000,
    heartbeatIncoming: 15_000,
    heartbeatOutgoing: 15_000,
    beforeConnect: async () => {
      try {
        connection.connectHeaders = { Authorization: 'Bearer ' + await token('COORDINATOR') }
      } catch {
        connection.connectHeaders = {}
      }
    },
    onConnect: () => {
      onChange(true)
      connection.subscribe('/topic/updates/' + getSession(), () => {
        void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'simulation' })
      })
    },
    onStompError: () => {
      tokens.delete('COORDINATOR')
      onChange(false)
    },
    onWebSocketClose: () => onChange(false),
  })
  connection.activate()
  return () => {
    void connection.deactivate()
    onChange(false)
  }
}
