import { Fragment, useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, Tooltip, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import { Layers3, LocateFixed, Minus, Plus } from 'lucide-react'
import type { Graph, Incident, Route, Shelter, Unit } from '../types'
import { Button, cn, severityColors } from './ui'

type MapIncident = Pick<Incident, 'lat' | 'lng' | 'id' | 'summary' | 'severity'>
type MapUnit = Pick<Unit, 'id' | 'lat' | 'lng' | 'name' | 'status'>
type MapShelter = Pick<Shelter, 'id' | 'lat' | 'lng' | 'name'>
const center: LatLngTuple = [12.977, 77.616]
const mapColors = {
  stroke: '#071626',
  road: '#4f81a8',
  closure: '#ff8fb0',
  flood: '#ef5c99',
  node: '#a5c9ee',
  route: '#91fff1',
  shelter: '#c9b8ff',
  availableUnit: '#64f0de',
  busyUnit: '#729bbb',
}

function FitMap({ graph, selected, route }: { graph: Graph; selected?: MapIncident; route?: Route }) {
  const map = useMap()
  const nodes = graph.nodes
  useEffect(() => {
    if (nodes.length) map.fitBounds(L.latLngBounds(nodes.map(({ lat, lng }) => [lat, lng])), { padding: [26, 26], maxZoom: 15, animate: false })
  }, [map, nodes.map((node) => node.id).join(',')])
  useEffect(() => {
    if (route?.path.length) map.fitBounds(L.latLngBounds(route.path.map(({ lat, lng }) => [lat, lng])), { padding: [32, 32], maxZoom: 15, animate: false })
    else if (selected && !map.getBounds().contains([selected.lat, selected.lng])) map.panTo([selected.lat, selected.lng])
  }, [map, selected?.id, route?.nodeIds.join(',')])
  return null
}

function MapControls({ graph }: { graph: Graph }) {
  const map = useMap()
  return <div className="map-controls">
    <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => map.zoomIn()}><Plus size={16} /></Button>
    <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => map.zoomOut()}><Minus size={16} /></Button>
    <Button size="icon" variant="ghost" aria-label="Fit map" onClick={() => map.fitBounds(L.latLngBounds(graph.nodes.map(({ lat, lng }) => [lat, lng])), { padding: [30, 30], maxZoom: 15 })}><LocateFixed size={16} /></Button>
  </div>
}

export function OperatingMap({ graph, incidents = [], units = [], shelters = [], selected, route, onSelect, className }: {
  graph: Graph
  incidents?: MapIncident[]
  units?: MapUnit[]
  shelters?: MapShelter[]
  selected?: MapIncident
  route?: Route
  onSelect?: (id: string) => void
  className?: string
}) {
  const [showLayers, setShowLayers] = useState(false)
  const [layers, setLayers] = useState({ incidents: true, units: true, hazards: true, shelters: true })
  const nodes = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const blocked = useMemo(() => new Set(graph.blockedRoadIds), [graph.blockedRoadIds])
  const routePath = useMemo<LatLngTuple[] | undefined>(
    () => route?.reachable && route.path.length > 1 ? route.path.map(({ lat, lng }) => [lat, lng]) : undefined,
    [route],
  )
  return <div className={cn('map-wrap', className)}>
    <MapContainer center={center} zoom={14} zoomControl={false} attributionControl={false} preferCanvas className="operating-map" aria-label="Simulated Bengaluru operating map">
      <FitMap graph={graph} selected={selected} route={route} />
      {graph.roads.map((road) => {
        const from = nodes.get(road.from)
        const to = nodes.get(road.to)
        if (!from || !to) return null
        const closed = blocked.has(road.id) && layers.hazards
        return <Polyline key={road.id} positions={[[from.lat, from.lng], [to.lat, to.lng]]} pathOptions={{
          color: closed ? mapColors.closure : mapColors.road,
          dashArray: closed ? '5 7' : undefined,
          weight: closed ? 2.5 : 2.25,
          opacity: closed ? 0.95 : 0.8,
          interactive: false,
        }} />
      })}
      {layers.hazards && graph.hazards.map((hazard) => <Polygon key={hazard.id} positions={hazard.polygon.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: mapColors.closure, fillColor: mapColors.flood, fillOpacity: 0.22, weight: 2, dashArray: '4 5' }}><Tooltip>{hazard.label}</Tooltip></Polygon>)}
      {graph.nodes.map((node) => <CircleMarker key={node.id} center={[node.lat, node.lng]} radius={3} pathOptions={{ fillColor: mapColors.node, fillOpacity: 0.95, color: mapColors.stroke, weight: 1 }}><Tooltip>{node.label}</Tooltip></CircleMarker>)}
      {routePath && <>
        <Polyline positions={routePath} pathOptions={{ color: '#4ae6ef', weight: 14, opacity: 0.18, interactive: false }} />
        <Polyline positions={routePath} pathOptions={{ color: '#53ddd9', weight: 7, opacity: 0.35, interactive: false }} />
        <Polyline positions={routePath} pathOptions={{ color: mapColors.route, weight: 3.5, opacity: 1, interactive: false }} />
      </>}
      {layers.shelters && shelters.map((shelter) => <CircleMarker key={shelter.id} center={[shelter.lat, shelter.lng]} radius={6.5} pathOptions={{ color: mapColors.stroke, weight: 2, fillColor: mapColors.shelter, fillOpacity: 1 }}><Tooltip>{shelter.name}</Tooltip></CircleMarker>)}
      {layers.units && units.map((unit) => <CircleMarker key={unit.id} center={[unit.lat, unit.lng]} radius={7} pathOptions={{ color: mapColors.stroke, weight: 2, fillColor: unit.status === 'BUSY' ? mapColors.busyUnit : mapColors.availableUnit, fillOpacity: 1 }}><Tooltip>{unit.name}</Tooltip></CircleMarker>)}
      {layers.incidents && incidents.map((item) => {
        const active = item.id === selected?.id
        const position: LatLngTuple = [item.lat, item.lng]
        const color = severityColors[item.severity]
        return <Fragment key={item.id}>
          {active && <CircleMarker center={position} radius={17} pathOptions={{ color, weight: 1.25, opacity: 0.7, fillColor: color, fillOpacity: 0.19, interactive: false }} />}
          <CircleMarker center={position} radius={active ? 10 : 7}
            pathOptions={{ color: active ? '#fff2ff' : mapColors.stroke, weight: active ? 2.5 : 2, fillColor: color, fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect?.(item.id) }}
          ><Tooltip>{item.summary}</Tooltip></CircleMarker>
        </Fragment>
      })}
      <MapControls graph={graph} />
    </MapContainer>
    <div className="map-label"><span className="map-label-dot" />Bengaluru <span>·</span> Synthetic network</div>
    <button type="button" className="layers-button" aria-expanded={showLayers} onClick={() => setShowLayers(!showLayers)}><Layers3 size={15} /> Layers</button>
    {showLayers && <div className="map-layers">
      {Object.entries(layers).map(([layer, enabled]) => <label key={layer}><input type="checkbox" checked={enabled} onChange={(event) => setLayers({ ...layers, [layer]: event.target.checked })} />{layer}</label>)}
    </div>}
    <div className="map-legend" aria-label="Map legend">
      <span><i style={{ background: severityColors.CRITICAL }} /> SOS</span>
      <span><i style={{ background: mapColors.availableUnit }} /> Unit</span>
      <span><i style={{ background: mapColors.shelter }} /> Shelter</span>
      <span><i className="map-legend-hazard" /> Flood zone</span>
      {routePath && <span><i className="map-legend-route" /> Rescue route</span>}
    </div>
  </div>
}
