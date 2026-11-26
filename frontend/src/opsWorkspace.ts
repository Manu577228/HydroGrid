import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'

export type ObservationKind = 'FLOOD' | 'TRAFFIC' | 'SHELTER'
export type OpsScope = ObservationKind | 'DISPATCH' | 'COORDINATOR' | 'TRAFFIC_VIEWER'
export type SiteState = 'OPEN' | 'CLOSED'
export type HandoffState = 'RELAYED' | 'ACKNOWLEDGED' | 'CLOSED'

export type ObservationInput = {
  kind: ObservationKind
  siteId: string
  label: string
  lat: number
  lng: number
  observedAt: string
  sourceRef: string
  value?: number
  capacity?: number
  occupancy?: number
  state?: SiteState
}

export type Observation = ObservationInput & { expiresAt: string; reportedBy: string }
export type HandoffInput = {
  id: string
  reference: string
  expectedState: Exclude<HandoffState, 'CLOSED'> | null
  state: HandoffState
}
export type Handoff = Omit<HandoffInput, 'expectedState'> & { updatedAt: string; reportedBy: string }
export type OperationsBoard = {
  operator: string
  scope: OpsScope
  observations: Observation[]
  handoffs: Handoff[]
}
export type TrafficFeed = {
  status: 'not_configured' | 'available' | 'stale' | 'unavailable'
  checkedAt: string | null
  since: string | null
  events: {
    id: string
    title: string
    observedAt: string
    endsAt: string | null
    roadClosure: boolean
    resolution: string | null
  }[]
}

const sessionKey = 'hydrogrid-agency-operator-session'

function readSession() {
  try { return sessionStorage.getItem(sessionKey) ?? '' } catch { return '' }
}

function saveSession(token: string) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token)
    else sessionStorage.removeItem(sessionKey)
  } catch {
    // Browser storage can be disabled. Keep this session in memory.
  }
}

async function request<T>(path: string, options: { token?: string; body?: unknown; signal?: AbortSignal } = {}) {
  const headers = new Headers({ Accept: 'application/json' })
  if (options.token) headers.set('Authorization', 'Bearer ' + options.token)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  const timeout = AbortSignal.timeout(10_000)
  let response: Response
  try {
    response = await fetch('/api/ops/' + path, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'omit',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    })
  } catch {
    throw new ApiError(0, 'The agency operations server is unreachable.')
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(response.status, problem?.detail ?? 'The operations request failed.')
  }
  return response.json() as Promise<T>
}

function accessLost(problem: unknown) {
  return problem instanceof ApiError && [401, 503].includes(problem.status)
}

export function useOperationsWorkspace() {
  const [token, setToken] = useState(readSession)
  const [board, setBoard] = useState<OperationsBoard>()
  const [checkedAt, setCheckedAt] = useState<number>()
  const [boardIssue, setBoardIssue] = useState(false)
  const [sessionIssue, setSessionIssue] = useState('')
  const [revision, setRevision] = useState(0)
  const availability = useQuery({
    queryKey: ['agency-operator-availability'],
    queryFn: ({ signal }) => request<{ available: boolean }>('status', { signal }),
    enabled: !token,
  })

  function signOut(message = '') {
    saveSession('')
    setToken('')
    setBoard(undefined)
    setCheckedAt(undefined)
    setBoardIssue(false)
    setSessionIssue(message)
  }

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    let next: number | undefined
    async function update() {
      try {
        const incoming = await request<OperationsBoard>('board', { token, signal: controller.signal })
        if (controller.signal.aborted) return
        setBoard(incoming)
        setCheckedAt(Date.now())
        setBoardIssue(false)
      } catch (problem) {
        if (controller.signal.aborted) return
        if (accessLost(problem) || (problem instanceof ApiError && problem.status === 403)) {
          signOut('Your operator session ended. Sign in again to continue.')
          return
        }
        setBoardIssue(true)
      }
      next = window.setTimeout(update, 15_000)
    }
    void update()
    return () => {
      controller.abort()
      window.clearTimeout(next)
    }
  }, [token, revision])

  async function signIn(operator: string, code: string) {
    setSessionIssue('')
    const result = await request<{ token: string }>('access', { body: { operator, code } })
    if (!result.token) throw new Error('The server did not return an operator session.')
    saveSession(result.token)
    setToken(result.token)
  }

  function refresh() { setRevision((previous) => previous + 1) }

  const trafficFeed = useCallback((signal: AbortSignal) => request<TrafficFeed>('traffic-feed', { token, signal }), [token])

  async function write<T>(path: string, body: unknown) {
    try {
      const saved = await request<T>(path, { token, body })
      refresh()
      return saved
    } catch (problem) {
      if (accessLost(problem)) signOut('Your operator session ended. Sign in again to continue.')
      if (problem instanceof ApiError && problem.status === 409) refresh()
      throw problem
    }
  }

  return {
    availability, authenticated: Boolean(token), board, boardIssue, checkedAt, sessionIssue,
    signIn, signOut, refresh, trafficFeed,
    recordObservation: (observation: ObservationInput) => write<Observation>('observations', observation),
    recordHandoff: (handoff: HandoffInput) => write<Handoff>('handoffs', handoff),
  }
}
