import { useQuery } from '@tanstack/react-query'

export const weatherSource = 'https://open-meteo.com/en/docs'
export const weatherLicense = 'https://creativecommons.org/licenses/by/4.0/'
export const officialWeather = 'https://mausam.imd.gov.in/bengaluru/'

const fields = ['time', 'interval', 'temperature_2m', 'relative_humidity_2m', 'precipitation', 'weather_code', 'wind_speed_10m'] as const
type Conditions = Record<(typeof fields)[number], number>

async function currentConditions(signal: AbortSignal): Promise<Conditions> {
  const parameters = new URLSearchParams({
    latitude: '12.976',
    longitude: '77.599',
    current: fields.slice(2).join(','),
    timeformat: 'unixtime',
    timezone: 'Asia/Kolkata',
  })
  const response = await fetch('https://api.open-meteo.com/v1/forecast?' + parameters, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  })
  if (!response.ok) throw new Error('Open-Meteo is currently unavailable.')
  const { current } = await response.json() as { current?: Partial<Conditions> }
  if (!current || fields.some((field) => !Number.isFinite(current[field])) ||
      !current.time || current.time > Date.now() / 1000 + 15 * 60 || !current.interval || current.interval < 0) {
    throw new Error('Open-Meteo returned an incomplete model estimate.')
  }
  return current as Conditions
}

export function useBengaluruWeather() {
  return useQuery({
    queryKey: ['bengaluru-current-weather'],
    queryFn: ({ signal }) => currentConditions(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
}

export function weatherDescription(code: number) {
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if ([45, 48].includes(code)) return 'Fog'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([80, 81, 82].includes(code)) return 'Rain showers'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Conditions update'
}
