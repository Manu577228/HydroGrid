import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react'
import { client, isSimulatedOffline, liveUpdates, setSimulatedOffline } from './api'
import { useQueueSync } from './offline'

const NetworkContext = createContext({ offline: false, simulated: false, live: false, setSimulated: (_value: boolean) => {} })

export function NetworkProvider({ children }: PropsWithChildren) {
  const [simulated, setSimulated] = useState(isSimulatedOffline)
  const [online, setOnline] = useState(navigator.onLine)
  const [live, setLive] = useState(false)
  useQueueSync()
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      setSimulated(isSimulatedOffline())
      if (navigator.onLine && !isSimulatedOffline()) void client.invalidateQueries()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('hydrogrid-network', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('hydrogrid-network', update)
    }
  }, [])
  useEffect(() => {
    if (online && !simulated) return liveUpdates(setLive)
  }, [online, simulated])
  return <NetworkContext.Provider value={{ offline: simulated || !online, simulated, live, setSimulated: setSimulatedOffline }}>{children}</NetworkContext.Provider>
}

export function useNetwork() { return useContext(NetworkContext) }
