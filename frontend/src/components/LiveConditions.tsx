import { useQuery } from '@tanstack/react-query'
import { CloudSun, Droplet, Droplets, RefreshCw, ShieldAlert, Thermometer, Wind } from 'lucide-react'
import { isSimulatedOffline } from '../api'
import { bengaluruTime } from '../deviceLocation'
import { officialWeather, useBengaluruWeather, weatherDescription, weatherLicense, weatherSource } from '../liveWeather'
import { Button, cn, PanelTitle } from './ui'

export function WeatherPanel({ now }: { now: number }) {
  const query = useBengaluruWeather()
  const conditions = query.data
  const isStale = !!conditions && (query.isError || query.isPaused || now - conditions.time * 1000 > 45 * 60_000)
  const status = conditions ? isStale ? 'Last available estimate' : 'Current model estimate'
    : query.isFetching ? 'Loading weather…' : 'Weather unavailable'

  return <section className="panel live-weather">
    <PanelTitle icon={<CloudSun size={19} />} title="Bengaluru weather" detail="Central Bengaluru · Open-Meteo"
      actions={<Button size="icon" variant="ghost" aria-label="Refresh weather" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} className={query.isFetching ? 'animate-spin' : undefined} /></Button>} />
    <div className="panel-body live-weather-body">
      <span className={cn('live-feed-state', (isStale || (!conditions && !query.isFetching)) && 'live-feed-warning')} role="status">{status}</span>
      {conditions ? <>
        <div className="live-temperature"><Thermometer size={22} /><strong>{Math.round(conditions.temperature_2m)}°</strong><span> C<br />{weatherDescription(conditions.weather_code)}</span></div>
        <dl className="live-weather-metrics">
          <div><dt><Droplet size={14} /> Precipitation</dt><dd>{conditions.precipitation} mm<small>Past {conditions.interval / 60} min</small></dd></div>
          <div><dt><Droplets size={14} /> Humidity</dt><dd>{conditions.relative_humidity_2m}%</dd></div>
          <div><dt><Wind size={14} /> Wind</dt><dd>{conditions.wind_speed_10m} km/h</dd></div>
        </dl>
        <small className="live-copy">Model time {bengaluruTime(conditions.time * 1000)}</small>
      </> : !query.isFetching && <small className="live-copy">Refresh weather to request a new estimate.</small>}
    </div>
    <div className="panel-footer live-sources">
      <a href={weatherSource} target="_blank" rel="noreferrer">Weather data by Open-Meteo</a>
      <a href={weatherLicense} target="_blank" rel="noreferrer">CC BY 4.0</a>
      <a href={officialWeather} target="_blank" rel="noreferrer">IMD Bengaluru</a>
    </div>
  </section>
}

type Bulletin = { id: string; title: string; category: string | null; issuer: string | null; publishedAt: string; officialUrl: string }
type OfficialFeed = { scope: string; status: 'available' | 'stale' | 'unavailable'; checkedAt: string | null; items: Bulletin[] }

const officialAlerts = 'https://sachet.ndma.gov.in/CapFeed'

async function getAlerts(signal: AbortSignal): Promise<OfficialFeed> {
  if (isSimulatedOffline()) throw new Error('Demo connection is paused.')
  const response = await fetch('/api/live/alerts', { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), cache: 'no-store' })
  if (!response.ok) throw new Error('Alert feed unavailable.')
  const feed = await response.json() as OfficialFeed
  if (!['available', 'stale', 'unavailable'].includes(feed.status) || !Array.isArray(feed.items)) throw new Error('Invalid alert bulletin feed.')
  return feed
}

export function AlertsPanel() {
  const feed = useQuery({
    queryKey: ['karnataka-official-bulletins'],
    queryFn: ({ signal }) => getAlerts(signal),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })
  const status = feed.isError || feed.isPaused ? feed.data?.items.length ? 'stale' : 'unavailable' : feed.data?.status
  const label = status === 'available' ? 'Feed checked'
    : status === 'stale' ? 'Last received bulletins'
    : status === 'unavailable' ? 'Feed unavailable' : 'Checking alert feed…'
  const bulletins = feed.data?.items ?? []
  return <section className="panel live-bulletins">
    <PanelTitle icon={<ShieldAlert size={19} />} title="Karnataka bulletins" detail="NDMA SACHET · Statewide feed" />
    <div className="panel-body live-field-body">
      <span className={cn('live-feed-state', (status === 'stale' || status === 'unavailable') && 'live-feed-warning')} role="status">{label}</span>
      {feed.data?.checkedAt && <p className="live-copy">Last check {bengaluruTime(feed.data.checkedAt)}</p>}
      {bulletins.length > 0 && <ul className="live-bulletin-list">{bulletins.slice(0, 4).map((item) => <li key={item.id}>
        <a href={item.officialUrl} target="_blank" rel="noreferrer" lang={/\p{Script=Kannada}/u.test(item.title) ? 'kn' : undefined}>{item.title}</a>
        <span>{[item.issuer, bengaluruTime(item.publishedAt)].filter(Boolean).join(' · ')}</span>
      </li>)}</ul>}
      {status === 'available' && bulletins.length === 0 && <p className="live-copy">The feed returned no Karnataka bulletins.</p>}
      <p className="live-copy">Open the source to check each bulletin’s area and validity.</p>
    </div>
    <div className="panel-footer live-sources"><a href={officialAlerts} target="_blank" rel="noreferrer">NDMA SACHET official feed</a></div>
  </section>
}
