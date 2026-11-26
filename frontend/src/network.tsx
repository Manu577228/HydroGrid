import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isSimulatedOffline, liveUpdates, refreshExercise, setSimulatedOffline } from './api'
import { useQueueSync } from './offline'

const NetworkContext = createContext({ offline: false, simulated: false, live: false, setSimulated: (_value: boolean) => {} })

export function NetworkProvider({ children }: PropsWithChildren) {
  const { pathname } = useLocation()
  const exercise = !['/', '/live', '/operations', '/login', '/register', '/profile'].includes(pathname)
  const [simulated, setSimulated] = useState(isSimulatedOffline)
  const [online, setOnline] = useState(navigator.onLine)
  const [live, setLive] = useState(false)
  useQueueSync()
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      setSimulated(isSimulatedOffline())
      if (navigator.onLine && !isSimulatedOffline()) void refreshExercise()
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
    if (exercise && online && !simulated) return liveUpdates(setLive)
  }, [exercise, online, simulated])
  useEffect(() => {
    if (!exercise || !online || simulated || live) return
    const fallback = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshExercise()
    }, 20_000)
    return () => window.clearInterval(fallback)
  }, [exercise, online, simulated, live])
  return <NetworkContext.Provider value={{ offline: simulated || !online, simulated, live, setSimulated: setSimulatedOffline }}>{children}</NetworkContext.Provider>
}

export function useNetwork() { return useContext(NetworkContext) }
