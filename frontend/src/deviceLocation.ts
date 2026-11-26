import { useEffect, useRef, useState } from 'react'

export type DeviceFix = { lat: number; lng: number; accuracy: number; capturedAt: number }

export const fixFreshness = 60_000
const locationOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }

export function useDeviceLocation() {
  const watch = useRef<number | null>(null)
  const refresh = useRef<number | undefined>(undefined)
  const [tracking, setTracking] = useState(false)
  const [fix, setFix] = useState<DeviceFix>()
  const [problem, setProblem] = useState('')
  const supported = window.isSecureContext && 'geolocation' in navigator

  function clear() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    window.clearInterval(refresh.current)
  }

  useEffect(() => clear, [])

  function stop() {
    clear()
    setTracking(false)
    setFix(undefined)
    setProblem('')
  }

  function start() {
    if (!supported || watch.current !== null) return
    setTracking(true)
    setProblem('')
    function accept({ coords, timestamp }: GeolocationPosition) {
      if (watch.current !== id) return
      const { latitude, longitude, accuracy } = coords
      if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite) || accuracy < 0 || accuracy > 100_000) return
      setFix((previous) => previous && previous.capturedAt > timestamp ? previous : {
        lat: latitude, lng: longitude, accuracy, capturedAt: timestamp,
      })
      setProblem('')
    }
    function handleError(error: GeolocationPositionError) {
      if (watch.current !== id) return
      if (error.code === error.PERMISSION_DENIED) {
        stop()
        setProblem('Location permission is off. Allow access in your browser and try again.')
      } else {
        setProblem('This device could not get a fresh location fix. It will keep trying while tracking is on.')
      }
    }
    const id = navigator.geolocation.watchPosition(accept, handleError, locationOptions)
    watch.current = id
    // Some browsers only send continuous updates after movement.
    refresh.current = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(accept, handleError, locationOptions)
    }, 35_000)
  }

  return { fix, problem, supported, tracking, start, stop }
}

const indiaTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
})

export function bengaluruTime(value: string | number) {
  return Number.isFinite(new Date(value).valueOf()) ? indiaTime.format(new Date(value)) + ' IST' : 'Time unavailable'
}
