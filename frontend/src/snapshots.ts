import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import Dexie, { type Table } from 'dexie'
import { getSession } from './api'
import { useNetwork } from './network'

const cache = new Dexie('hydrogrid-demo-snapshots') as Dexie & { latest: Table<{ id: string; data: unknown }, string> }
cache.version(1).stores({ latest: 'id' })

export function useSnapshot<T>(key: string[], loader: () => Promise<T>, enabled = true) {
  const { offline } = useNetwork()
  const id = JSON.stringify([getSession(), ...key])
  const saved = useLiveQuery(() => cache.latest.get(id), [id])
  const query = useQuery({
    queryKey: key,
    enabled: !offline && enabled,
    queryFn: async () => {
      const result = await loader()
      await cache.latest.put({ id, data: result }).catch(() => undefined)
      return result
    },
  })
  return { ...query, data: query.data ?? saved?.data as T | undefined }
}
