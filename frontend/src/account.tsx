import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { ApiError } from './api'

export type AccountProfile = {
  id: string
  displayName: string
  email: string
  timeZone: string
  createdAt: string
  role: 'CITIZEN'
}

type AccountAccess = { token: string; expiresAt: string; profile: AccountProfile }
type AccountStatus = 'loading' | 'signedOut' | 'signedIn' | 'unavailable'
type Credentials = { email: string; password: string }
type Settings = Pick<AccountProfile, 'displayName' | 'timeZone'>
type Account = {
  status: AccountStatus
  profile: AccountProfile | null
  signIn: (credentials: Credentials) => Promise<void>
  register: (details: Credentials & { displayName: string }) => Promise<void>
  signOut: () => Promise<void>
  restore: () => Promise<AccountAccess | null>
  updateSettings: (settings: Settings) => Promise<AccountProfile>
}

const AccountContext = createContext<Account | null>(null)
const refreshLock = 'hydrogrid-account-session'
let sessionQueue: Promise<unknown> = Promise.resolve()

async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, token?: string): Promise<T | null> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' })
  if (token) headers.set('Authorization', 'Bearer ' + token)
  let response: Response
  try {
    response = await fetch('/api/account/' + path, {
      method, headers, body: JSON.stringify(body), credentials: 'same-origin',
      cache: 'no-store', signal: AbortSignal.timeout(18_000),
    })
  } catch {
    throw new ApiError(0, 'The account service could not be reached. Try again when you’re connected.')
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { detail?: string } | null
    const defaultMessage = response.status === 429 ? 'Too many attempts. Try again later.'
      : response.status === 401 ? 'Check your email and password, or sign in again.'
      : 'The account request could not be completed.'
    throw new ApiError(response.status, result?.detail || defaultMessage)
  }
  return response.status === 204 ? null : response.json() as Promise<T>
}

async function changeSession<T>(callback: () => Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request(refreshLock, callback)
  const pending = sessionQueue.then(callback)
  sessionQueue = pending.catch(() => undefined)
  return pending
}

export function AccountProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [status, setStatus] = useState<AccountStatus>('loading')
  const [expiresAt, setExpiresAt] = useState<string>()
  const session = useRef<AccountAccess | null>(null)
  const refreshing = useRef<Promise<AccountAccess | null> | null>(null)
  const revision = useRef(0)

  const accept = useCallback((next: AccountAccess | null) => {
    session.current = next
    setProfile(next?.profile ?? null)
    setExpiresAt(next?.expiresAt)
    setStatus(next ? 'signedIn' : 'signedOut')
  }, [])

  const restore = useCallback(() => {
    if (refreshing.current) return refreshing.current
    const before = revision.current
    const pending = changeSession(() => request<AccountAccess>('refresh', 'POST', {})).then((next) => {
      if (before === revision.current) accept(next)
      return next
    }).catch((error: unknown) => {
      if (before !== revision.current) return null
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        accept(null)
        return null
      }
      setStatus('unavailable')
      return null
    }).finally(() => { refreshing.current = null })
    refreshing.current = pending
    return pending
  }, [accept])

  useEffect(() => { void restore() }, [restore])
  useEffect(() => {
    if (!expiresAt || status !== 'signedIn') return
    const nextRefresh = Math.max(5_000, Date.parse(expiresAt) - Date.now() - 30_000)
    const timer = window.setTimeout(() => void restore(), nextRefresh)
    return () => window.clearTimeout(timer)
  }, [expiresAt, restore, status])
  useEffect(() => {
    if (status !== 'unavailable') return
    const online = () => { void restore() }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [restore, status])

  async function start(path: 'login' | 'register', body: Credentials | (Credentials & { displayName: string })) {
    const before = ++revision.current
    const next = await changeSession(() => request<AccountAccess>(path, 'POST', body))
    if (!next) throw new Error('The server did not start an account session.')
    if (before === revision.current) accept(next)
  }

  async function signOut() {
    const before = ++revision.current
    await changeSession(() => request('logout', 'POST', {}))
    if (before === revision.current) accept(null)
  }

  async function updateSettings(settings: Settings) {
    const current = session.current
    if (!current) throw new ApiError(401, 'Sign in to update your profile.')
    const before = revision.current
    try {
      const updated = await request<AccountProfile>('profile', 'PATCH', settings, current.token)
      if (!updated) throw new Error('The server did not return your updated profile.')
      if (before === revision.current && session.current?.profile.id === updated.id) {
        session.current = { ...session.current, profile: updated }
        setProfile(updated)
      }
      return updated
    } catch (error) {
      if (before === revision.current && error instanceof ApiError && error.status === 401) {
        void restore()
      }
      throw error
    }
  }

  return <AccountContext.Provider value={{
    profile, status, restore, signOut, updateSettings,
    signIn: (credentials) => start('login', credentials),
    register: (details) => start('register', details),
  }}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const account = useContext(AccountContext)
  if (!account) throw new Error('AccountProvider is required for account views.')
  return account
}
