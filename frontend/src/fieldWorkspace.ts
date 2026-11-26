import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError, isSimulatedOffline, uuid } from './api'
import { type DeviceFix, fixFreshness } from './deviceLocation'

const key = 'hydrogrid-field-access'
export type FieldPosition = Pick<DeviceFix, 'lat' | 'lng' | 'accuracy'> & {
  id: string
  label: string
  seenAt: string
}
export type FieldReport = Pick<DeviceFix, 'lat' | 'lng' | 'accuracy'> & {
  id: string
  note: string
  createdAt: string
}
export type FieldBoard = { deviceId: string; positions: FieldPosition[]; reports: FieldReport[] }

async function request(path: string, options: { token?: string; method?: string; body?: unknown; keepalive?: boolean } = {}) {
  if (!options.keepalive && isSimulatedOffline()) throw new ApiError(0, 'Demo connection is paused.')
  const headers = new Headers()
  if (options.token) headers.set('Authorization', 'Bearer ' + options.token)
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  let response: Response
  try {
    response = await fetch('/api/field/' + path, {
      method: options.method ?? 'GET',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      cache: 'no-store',
      credentials: 'omit',
      keepalive: options.keepalive,
      signal: options.keepalive ? undefined : AbortSignal.timeout(8_000),
    })
  } catch {
    throw new ApiError(0, 'The private workspace could not be reached.')
  }
  if (!response.ok) throw new ApiError(response.status, 'The workspace request failed.')
  return response
}

function logoutError(error: unknown) {
  return error instanceof ApiError && [401, 403].includes(error.status)
}

function isFresh(fix?: DeviceFix): fix is DeviceFix {
  return !!fix && Date.now() - fix.capturedAt <= fixFreshness
}

function coordinates({ lat, lng, accuracy }: DeviceFix) {
  return { lat, lng, accuracy }
}

export function useFieldWorkspace(fix?: DeviceFix) {
  const [token, setToken] = useState(() => sessionStorage.getItem(key) ?? '')
  const [board, setBoard] = useState<FieldBoard>()
  const [updated, setUpdated] = useState<number>()
  const [boardFailed, setBoardFailed] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [removalPending, setRemovalPending] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = useRef(false)
  const mayHaveMarker = useRef(false)
  const lastFix = useRef(fix)
  const label = useRef('')
  const sequence = useRef<Promise<void>>(Promise.resolve())
  const pendingReport = useRef<(Pick<DeviceFix, 'lat' | 'lng' | 'accuracy'> & { clientId: string; note: string }) | null>(null)
  const epoch = useRef(0)
  lastFix.current = fix

  const status = useQuery({
    queryKey: ['private-field-status'],
    queryFn: async () => (await request('status')).json() as Promise<{ available: boolean }>,
    enabled: !token,
    refetchInterval: 30_000,
  })

  function endSession(text = '') {
    active.current = false
    sessionStorage.removeItem(key)
    pendingReport.current = null
    epoch.current += 1
    setToken('')
    setSharing(false)
    setRemovalPending(false)
    mayHaveMarker.current = false
    setBoard(undefined)
    setUpdated(undefined)
    setMessage('')
    setError(text)
  }

  useEffect(() => {
    if (!token) return
    const currentEpoch = epoch.current
    let timer: number
    let mounted = true
    async function poll() {
      try {
        const response = await request('board', { token })
        const result = await response.json() as FieldBoard
        if (!mounted || epoch.current !== currentEpoch) return
        setBoard(result)
        setUpdated(Date.now())
        setBoardFailed(false)
      } catch (problem) {
        if (!mounted || epoch.current !== currentEpoch) return
        if (logoutError(problem) || problem instanceof ApiError && problem.status === 503) {
          endSession('Your private workspace session expired. Enter the access code again.')
          return
        }
        setBoardFailed(true)
      }
      if (mounted) timer = window.setTimeout(poll, 5_000)
    }
    void poll()
    return () => { mounted = false; window.clearTimeout(timer) }
  }, [token])

  useEffect(() => {
    if (!token || !sharing) return
    function publish() {
      if (!active.current) return
      const currentEpoch = epoch.current
      sequence.current = sequence.current.then(async () => {
        if (!active.current || epoch.current !== currentEpoch) return
        const position = lastFix.current
        if (!isFresh(position)) return
        try {
          await request('location', {
            token, method: 'POST', body: { ...coordinates(position), label: label.current },
          })
          if (active.current) {
            setError('')
            setMessage('Your device location is visible to testers in this workspace.')
          }
        } catch (problem) {
          if (!active.current || epoch.current !== currentEpoch) return
          if (logoutError(problem)) {
            endSession('Your private workspace session expired. Enter the access code again.')
            return
          }
          setError('A location update failed. HydroGrid will retry while sharing is on.')
        }
      })
    }
    publish()
    const timer = window.setInterval(publish, 10_000)
    return () => window.clearInterval(timer)
  }, [sharing, token])

  useEffect(() => {
    if (!token) return
    function clearOnExit(event?: PageTransitionEvent) {
      active.current = false
      if (!mayHaveMarker.current) return
      mayHaveMarker.current = false
      if (event?.persisted) {
        setSharing(false)
        setRemovalPending(true)
        setMessage('')
      }
      sequence.current = sequence.current.then(async () => {
        try {
          await request('location', { method: 'DELETE', token, keepalive: true })
          if (event?.persisted) setRemovalPending(false)
        } catch {
          if (event?.persisted) mayHaveMarker.current = true
        }
      })
    }
    window.addEventListener('pagehide', clearOnExit)
    return () => {
      window.removeEventListener('pagehide', clearOnExit)
      clearOnExit()
    }
  }, [token])

  async function enter(code: string) {
    setBusy('access')
    setError('')
    setMessage('')
    try {
      const { token: access } = await (await request('access', { method: 'POST', body: { code } })).json() as { token: string }
      if (!access) throw new Error('Workspace access failed.')
      sessionStorage.setItem(key, access)
      setBoardFailed(false)
      setToken(access)
      return true
    } catch (problem) {
      setError(logoutError(problem) ? 'The access code was rejected.' :
        problem instanceof ApiError && problem.status === 429 ? 'Too many attempts. Wait a moment and try again.' :
        'The workspace could not grant access. Try again shortly.')
      return false
    } finally {
      setBusy('')
    }
  }

  function startSharing(name: string) {
    if (!isFresh(lastFix.current)) return
    label.current = name
    active.current = true
    mayHaveMarker.current = true
    setError('')
    setMessage('Sending your first location update…')
    setSharing(true)
  }

  async function stopSharing(leaving = false) {
    active.current = false
    setSharing(false)
    setBusy('location')
    setMessage('')
    setError('')
    try {
      await sequence.current
      await request('location', { method: 'DELETE', token })
      mayHaveMarker.current = false
      setRemovalPending(false)
      setMessage('Location sharing stopped and your marker was removed.')
      return true
    } catch (problem) {
      if (logoutError(problem)) {
        endSession('Your private workspace session expired.')
        return true
      }
      setRemovalPending(true)
      setError(leaving
        ? 'Your location could not be removed. Retry before signing out.'
        : 'Sharing stopped on this device. The last marker could not be removed yet.')
      return false
    } finally {
      setBusy('')
    }
  }

  async function leave() {
    if ((sharing || removalPending) && !(await stopSharing(true))) return
    endSession()
  }

  async function report(note: string) {
    const position = lastFix.current
    if (!isFresh(position)) return false
    const previous = pendingReport.current
    const payload = previous?.note === note ? previous : { ...coordinates(position), clientId: uuid(), note }
    pendingReport.current = payload
    setBusy('report')
    setMessage('')
    setError('')
    try {
      await request('reports', { method: 'POST', token, body: payload })
      pendingReport.current = null
      setMessage('Test report sent. It should appear on the board in a few seconds.')
      return true
    } catch (problem) {
      if (logoutError(problem)) endSession('Your private workspace session expired. Enter the access code again.')
      else setError('The test report could not be confirmed. You can retry this report.')
      return false
    } finally {
      setBusy('')
    }
  }

  return {
    status, authenticated: !!token, board, updated, boardFailed, sharing, removalPending, busy, message, error,
    enter, leave, startSharing, stopSharing, report,
  }
}
