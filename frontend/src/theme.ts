import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
const key = 'hydrogrid-theme'

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(key)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme() {
  const [preference, setPreference] = useState(readPreference)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = preference === 'system'
        ? media.matches ? 'dark' : 'light'
        : preference
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  function selectTheme(value: ThemePreference) {
    setPreference(value)
    try { localStorage.setItem(key, value) } catch { /* this tab still keeps the preference */ }
  }

  return { preference, selectTheme }
}
