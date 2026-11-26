import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useSyncExternalStore } from 'react'
import { api, ApiError, getDemoCredentials, getSession, isSimulatedOffline, refreshExercise, uuid } from './api'
import type { IncidentInput, IncidentStatus, QueueRecord } from './types'

const database = new Dexie('hydrogrid-offline-v1') as Dexie & { actions: Table<QueueRecord, string> }
database.version(1).stores({ actions: 'clientId, session, status, createdAt, kind' })

export function useQueue() {
  const { id, legacyId } = getDemoCredentials()
  return useLiveQuery(() => database.actions.where('session').anyOf(legacyId ? [id, legacyId] : [id])
    .sortBy('createdAt'), [id, legacyId], [])
}

const sendingListeners = new Set<() => void>()
let sending: string | undefined

function subscribeSending(listener: () => void) {
  sendingListeners.add(listener)
  return () => { sendingListeners.delete(listener) }
}

function setSending(id?: string) {
  sending = id
  for (const listener of sendingListeners) listener()
}

export function useSending() { return useSyncExternalStore(subscribeSending, () => sending) }

let syncing: Promise<void> | undefined

export function synchronize() {
  if (syncing) return syncing
  if (!navigator.onLine || isSimulatedOffline()) return Promise.resolve()
  syncing = (async () => {
    const records = await database.actions.where('session').equals(getSession()).sortBy('createdAt')
    for (const action of records.filter((item) => item.status === 'pending')) {
      try {
        setSending(action.clientId)
        await database.actions.update(action.clientId, { attempts: (action.attempts ?? 0) + 1 })
        const result = action.kind === 'report'
          ? await api.report(action.payload as IncidentInput)
          : await api.status(
            (action.payload as { incidentId: string }).incidentId,
            action.clientId,
            (action.payload as { status: IncidentStatus }).status,
          )
        await database.actions.update(action.clientId, { status: 'sent', sentId: result.id, error: undefined })
        void refreshExercise()
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500 || [401, 408, 429].includes(error.status))) return
        await database.actions.update(action.clientId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'This action could not be synchronized.',
        })
      } finally {
        setSending()
      }
    }
  })().finally(() => { syncing = undefined })
  return syncing
}

export async function retryQueuedAction(clientId: string) {
  const { id, legacyId } = getDemoCredentials()
  await database.transaction('rw', database.actions, async () => {
    const action = await database.actions.get(clientId)
    if (!action || action.status === 'sent') return
    if (!(action.session === id || (action.session === legacyId && action.kind === 'report'))) return
    await database.actions.update(clientId, { session: id, status: 'pending', error: undefined })
  })
  void synchronize()
}

export async function queueReport(input: Omit<IncidentInput, 'clientId'>, localNote?: string) {
  const clientId = uuid()
  await database.actions.add({
    clientId,
    session: getSession(),
    kind: 'report',
    payload: { ...input, clientId },
    localNote: localNote?.trim() || undefined,
    createdAt: Date.now(),
    status: 'pending',
  })
  void synchronize()
  return clientId
}

export async function queueMission(incidentId: string, status: IncidentStatus) {
  const clientId = uuid()
  await database.actions.add({
    clientId,
    session: getSession(),
    kind: 'mission',
    payload: { incidentId, status },
    createdAt: Date.now(),
    status: 'pending',
  })
  void synchronize()
}

export function useQueueSync() {
  useEffect(() => {
    const sync = () => { void synchronize() }
    sync()
    const interval = window.setInterval(sync, 5000)
    window.addEventListener('online', sync)
    window.addEventListener('hydrogrid-network', sync)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', sync)
      window.removeEventListener('hydrogrid-network', sync)
    }
  }, [])
}
