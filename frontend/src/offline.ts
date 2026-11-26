import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { api, ApiError, client, getSession, isSimulatedOffline, uuid } from './api'
import type { IncidentInput, IncidentStatus, QueueRecord } from './types'

const database = new Dexie('hydrogrid-offline-v1') as Dexie & { actions: Table<QueueRecord, string> }
database.version(1).stores({ actions: 'clientId, session, status, createdAt, kind' })

export function useQueue() {
  const session = getSession()
  return useLiveQuery(() => database.actions.where('session').equals(session).sortBy('createdAt'), [session], [])
}

let syncing: Promise<void> | undefined

export function synchronize() {
  if (syncing) return syncing
  if (!navigator.onLine || isSimulatedOffline()) return Promise.resolve()
  syncing = (async () => {
    const records = await database.actions.where('session').equals(getSession()).sortBy('createdAt')
    for (const action of records.filter((item) => item.status === 'pending')) {
      try {
        const result = action.kind === 'report'
          ? await api.report(action.payload as IncidentInput)
          : await api.status(
            (action.payload as { incidentId: string }).incidentId,
            action.clientId,
            (action.payload as { status: IncidentStatus }).status,
          )
        await database.actions.update(action.clientId, { status: 'sent', sentId: result.id, error: undefined })
        void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'simulation' })
      } catch (error) {
        if (error instanceof ApiError && (error.status === 0 || error.status >= 500 || [401, 408, 429].includes(error.status))) return
        await database.actions.update(action.clientId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'This action could not be synchronized.',
        })
      }
    }
  })().finally(() => { syncing = undefined })
  return syncing
}

export async function queueReport(input: Omit<IncidentInput, 'clientId'>) {
  const clientId = uuid()
  await database.actions.add({
    clientId,
    session: getSession(),
    kind: 'report',
    payload: { ...input, clientId },
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
