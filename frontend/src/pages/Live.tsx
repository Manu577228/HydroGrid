import { useQuery } from '@tanstack/react-query'
import { latLngBounds, type LatLngTuple } from 'leaflet'
import { ArrowDownUp, Crosshair, LocateFixed, MapPin, MapPinned, Minus, Plus, Route, Satellite, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle, CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet'
import { FieldPanel } from '../components/FieldPanel'
import { AlertsPanel, WeatherPanel } from '../components/LiveConditions'
import { Button, ErrorNotice, Loading, PageTitle, PanelTitle } from '../components/ui'
import { bengaluruTime, type DeviceFix, fixFreshness, useDeviceLocation } from '../deviceLocation'
import { type FieldBoard, useFieldWorkspace } from '../fieldWorkspace'
import { findStreetRoute, loadStreetNetwork, streetSnapshotPath, type StreetNetwork } from '../geography'
import '../live.css'

const cityCenter: LatLngTuple = [12.976, 77.599]
const colors = { secondary: '#3c5e7a', arterial: '#7193af', route: '#98fff0', gps: '#73c7ff', device: '#d4b4ff', report: '#ff9cbb' }
const arteryKinds = /^(motorway|trunk|primary|secondary)(?:_link)?$/
const passive = { interactive: false }
const formatMapDate = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' })

type StreetRoute = ReturnType<typeof findStreetRoute>
type PlaceSelection = { from: string; to: string }
type MapFocus = { kind: 'coverage' } | { kind: 'point'; point: LatLngTuple }
type CameraProps = {
  network: StreetNetwork
  route: StreetRoute
  device?: DeviceFix
  following: boolean
  focus?: MapFocus
  fitCoverage: () => void
}

function MapCamera({ network, route, device, following, focus, fitCoverage }: CameraProps) {
  const map = useMap()
  useEffect(() => {
    const observer = new ResizeObserver(() => { map.invalidateSize({ pan: false }) })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useEffect(() => {
    if (!following && focus?.kind !== 'point') {
      const bounds = focus?.kind !== 'coverage' && route?.path.length ? latLngBounds(route.path) : network.bounds
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16, animate: false })
    }
  }, [map, network, route, following, focus])
  useEffect(() => {
    if (following && device) map.setView([device.lat, device.lng], Math.max(15, map.getZoom()), { animate: false })
    else if (focus?.kind === 'point') map.setView(focus.point, Math.max(15, map.getZoom()), { animate: false })
  }, [map, following, device, focus])
  return <div className="live-map-controls" aria-label="Map controls">
    <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus size={17} /></Button>
    <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus size={17} /></Button>
    <Button size="icon" variant="ghost" aria-label="Fit map to streets" onClick={fitCoverage}><MapPinned size={17} /></Button>
  </div>
}

function StreetMap({ network, route, device, following, focus, fitCoverage, fieldBoard, selection }: CameraProps & {
  fieldBoard?: FieldBoard
  selection: PlaceSelection
}) {
  const lines = useMemo(() => {
    const main: LatLngTuple[][] = []
    const local: LatLngTuple[][] = []
    for (const road of network.roads) (arteryKinds.test(road.kind) ? main : local).push(road.path)
    return { local, main }
  }, [network])
  return <div className="live-map-wrap">
    <MapContainer center={cityCenter} zoom={15} zoomControl={false} attributionControl={false}
      className="live-map" aria-label="Central Bengaluru street map" scrollWheelZoom={false}>
      <MapCamera {...{ network, route, device, following, focus, fitCoverage }} />
      <Polyline positions={lines.local} pathOptions={{ ...passive, color: colors.secondary, opacity: .85, weight: 1.25 }} />
      <Polyline positions={lines.main} pathOptions={{ ...passive, color: colors.arterial, opacity: .85, weight: 2.45 }} />
      {route && <>
        <Polyline positions={route.path} pathOptions={{ ...passive, color: colors.route, weight: 13, opacity: .18 }} />
        <Polyline positions={route.path} pathOptions={{ ...passive, color: colors.route, weight: 4, opacity: .98 }} />
      </>}
      {network.landmarks.map((place) => {
        const selected = place.id === selection.from || place.id === selection.to
        return <CircleMarker key={place.id} center={place.position} radius={selected ? 6.5 : 4}
          pathOptions={{ color: selected ? '#e3fef8' : '#061828', fillColor: selected ? '#148978' : '#b6c9db', fillOpacity: 1, weight: 2.2 }}>
          <Tooltip permanent={selected} direction="top" offset={[0, -6]}>{place.name}</Tooltip>
        </CircleMarker>
      })}
      {fieldBoard?.positions.map((position) => <CircleMarker key={position.id} center={[position.lat, position.lng]} radius={7}
        pathOptions={{ color: '#0a1928', weight: 2, fillColor: colors.device, fillOpacity: 1 }}>
        <Tooltip>{position.label} · {Math.round(position.accuracy)} m accuracy</Tooltip>
      </CircleMarker>)}
      {fieldBoard?.reports.map((report) => <CircleMarker key={report.id} center={[report.lat, report.lng]} radius={6}
        pathOptions={{ color: '#0a1928', weight: 2, fillColor: colors.report, fillOpacity: 1 }}>
        <Tooltip>Test report · {report.note}</Tooltip>
      </CircleMarker>)}
      {device && <>
        <Circle center={[device.lat, device.lng]} radius={Math.max(1, device.accuracy)}
          pathOptions={{ ...passive, color: colors.gps, fillColor: colors.gps, fillOpacity: .16, opacity: .75, weight: 1 }} />
        <CircleMarker center={[device.lat, device.lng]} radius={6}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2b8eea', fillOpacity: 1 }}><Tooltip>Your device</Tooltip></CircleMarker>
      </>}
    </MapContainer>
    <div className="live-map-anchor"><MapPin size={14} /> Central Bengaluru</div>
    <div className="live-map-legend" aria-label="Map legend">
      <span><i style={{ background: colors.arterial }} /> Streets</span>
      {route && <span><i style={{ background: colors.route }} /> Suggested route</span>}
      {device && <span><i style={{ background: colors.gps }} /> Your device</span>}
      {!!fieldBoard?.positions.length && <span><i style={{ background: colors.device }} /> Shared device</span>}
      {!!fieldBoard?.reports.length && <span><i style={{ background: colors.report }} /> Test report</span>}
    </div>
  </div>
}

export function LivePage() {
  const streets = useQuery({ queryKey: ['bengaluru-streets'], queryFn: ({ signal }) => loadStreetNetwork(signal), staleTime: Infinity })
  const network = streets.data
  const device = useDeviceLocation()
  const field = useFieldWorkspace(device.fix)
  const [selection, setSelection] = useState<PlaceSelection>({ from: 'vidhana-soudha', to: 'mg-road' })
  const [following, setFollowing] = useState(false)
  const [focus, setFocus] = useState<MapFocus>()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const route = useMemo(() => network && selection.from !== selection.to
    ? findStreetRoute(network, selection.from, selection.to)
    : null, [network, selection])
  const from = network?.landmarks.find((place) => place.id === selection.from)
  const to = network?.landmarks.find((place) => place.id === selection.to)
  const freshFix = !!device.fix && now - device.fix.capturedAt <= fixFreshness
  const outsideMap = network && device.fix && !latLngBounds(network.bounds).contains([device.fix.lat, device.fix.lng])
  const currentBoard = useMemo(() => {
    if (!field.authenticated || !field.board) return undefined
    return {
      ...field.board,
      positions: field.board.positions.filter((position) => now - Date.parse(position.seenAt) < 5 * 60_000),
      reports: field.board.reports.filter((report) => now - Date.parse(report.createdAt) < 24 * 60 * 60_000),
    }
  }, [field.authenticated, field.board, now])

  useEffect(() => {
    if (!field.authenticated) setFocus((previous) => previous?.kind === 'point' ? undefined : previous)
  }, [field.authenticated])

  function selectPlaces(next: PlaceSelection) {
    setFocus(undefined)
    setFollowing(false)
    setSelection(next)
  }

  function showOnMap(point: LatLngTuple) {
    setFollowing(false)
    setFocus({ kind: 'point', point })
    document.getElementById('live-street-map')?.scrollIntoView({ block: 'start' })
  }

  return <div className="live-page">
    <PageTitle title="Live Bengaluru" description="Explore central Bengaluru streets, check weather and official bulletins, and see where your device is."
      icon={<MapPinned />} actions={<><Link className="button button-outline button-sm" to="/operations">City operations</Link><Button variant="secondary" size="sm" onClick={() => {
        const board = document.getElementById('private-field-board')
        board?.focus({ preventScroll: true })
        board?.scrollIntoView({ block: 'start' })
      }}><ShieldCheck size={16} /> Private field test</Button></>} />
    <div className="live-grid">
      <section className="panel live-map-panel" id="live-street-map">
        <PanelTitle icon={<MapPinned size={21} />} title="Street map" detail="OpenStreetMap · Central Bengaluru coverage"
          actions={network && <span className="live-map-source-date">Snapshot {formatMapDate.format(new Date(network.source.capturedAt))}</span>} />
        {network ? <StreetMap network={network} selection={selection} route={route} device={freshFix ? device.fix : undefined}
          following={following && freshFix} focus={!field.authenticated && focus?.kind === 'point' ? undefined : focus} fieldBoard={currentBoard}
          fitCoverage={() => { setFollowing(false); setFocus({ kind: 'coverage' }) }} />
          : streets.isError || streets.isPaused ? <div className="live-map-unavailable"><ErrorNotice error="The Bengaluru street snapshot could not be loaded." />
            <Button variant="outline" size="sm" onClick={() => void streets.refetch()}>Retry map</Button></div>
          : <div className="live-map-unavailable"><Loading label="Loading Bengaluru streets" /></div>}
        {network && <div className="panel-footer live-sources">
          <a href={network.source.url} target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
          <a href={network.source.licenseUrl} target="_blank" rel="noreferrer">{network.source.license}</a>
          <a href={streetSnapshotPath} download>Download street data</a>
          <a href={network.source.dataUrl} target="_blank" rel="noreferrer">Raw OSM source</a>
        </div>}
      </section>
      <div className="live-map-side">
        <section className="panel live-route">
          <PanelTitle icon={<Route size={20} />} title="Plan a street route" detail="Between mapped landmarks" />
          <div className="panel-body live-route-body">
            {network && <div className="live-route-inputs">
              <label className="field-label">Starting place
                <select value={selection.from} onChange={(event) => selectPlaces({ ...selection, from: event.target.value })}>
                  {network.landmarks.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                </select>
              </label>
              <Button size="icon" variant="outline" className="live-route-swap" aria-label="Swap starting place and destination"
                onClick={() => selectPlaces({ from: selection.to, to: selection.from })}><ArrowDownUp size={16} /></Button>
              <label className="field-label">Destination
                <select value={selection.to} onChange={(event) => selectPlaces({ ...selection, to: event.target.value })}>
                  {network.landmarks.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
                </select>
              </label>
            </div>}
            <div className="live-route-result" role="status">
              <Route size={18} />
              {route ? <div><strong>{(route.distanceMeters / 1000).toFixed(2)} km along streets</strong><span>{from?.name} to {to?.name}</span></div>
                : <div><strong>{!network ? 'Route map unavailable' : selection.from === selection.to ? 'Choose two different places' : 'No mapped route found'}</strong></div>}
            </div>
            <p className="live-copy">For planning. Check current road closures and official instructions before travel.</p>
          </div>
        </section>
        <section className="panel live-device">
          <PanelTitle icon={<Satellite size={19} />} title="Device location" detail="Your phone or browser’s location sensor" />
          <div className="panel-body live-device-body">
            <div className="live-device-status" role="status">
              <span>{freshFix ? 'Location received' : device.tracking ? device.fix ? 'Waiting for a fresh location' : 'Waiting for device location' : 'Tracking is off'}</span>
              {device.fix && <small>±{Math.round(device.fix.accuracy)} m · {bengaluruTime(device.fix.capturedAt)}</small>}
            </div>
            {device.problem && <p className="live-copy" role="alert">{device.problem}</p>}
            {!device.supported && <p className="live-copy">Device location requires a supported browser and a secure connection.</p>}
            {outsideMap && freshFix && <p className="live-copy">Your device is outside the central Bengaluru street coverage.</p>}
            <div className="live-device-actions">
              <Button size="sm" variant={device.tracking ? 'outline' : 'default'} disabled={!device.supported}
                onClick={() => {
                  if (!device.tracking) device.start()
                  else {
                    if (field.sharing) void field.stopSharing()
                    device.stop()
                    setFollowing(false)
                  }
                }}><Crosshair size={16} />{device.tracking ? 'Stop device location' : 'Enable device location'}</Button>
              {network && device.tracking && <Button size="sm" variant="ghost" aria-pressed={following} disabled={!freshFix}
                onClick={() => { setFocus(undefined); setFollowing(!following) }}><LocateFixed size={16} /> {following ? 'Stop following' : 'Follow device'}</Button>}
            </div>
            <p className="live-copy">Your location stays on this device until you choose to share it or send a test report.</p>
          </div>
        </section>
      </div>
    </div>
    <div className="live-source-grid"><WeatherPanel now={now} /><AlertsPanel /></div>
    <FieldPanel field={field} board={currentBoard} freshFix={freshFix} showOnMap={network ? showOnMap : undefined} />
  </div>
}
