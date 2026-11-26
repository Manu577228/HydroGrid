import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Polyline, Tooltip, useMap } from 'react-leaflet'
import L, { type LatLngTuple } from 'leaflet'
import { Layers3, LocateFixed, Minus, Plus } from 'lucide-react'
import type { Graph, Incident, Route, Shelter, Unit } from '../types'
import { Button, cn, severityColors } from './ui'

type MapIncident = Pick<Incident, 'lat' | 'lng' | 'id' | 'summary' | 'severity'>
type MapUnit = Pick<Unit, 'id' | 'lat' | 'lng' | 'name' | 'status'>
type MapShelter = Pick<Shelter, 'id' | 'lat' | 'lng' | 'name'>
const center: LatLngTuple = [12.977, 77.616]

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
  return <div className={cn('map-wrap', className)}>
    <MapContainer center={center} zoom={14} zoomControl={false} attributionControl={false} preferCanvas className="operating-map" aria-label="Simulated Bengaluru operating map">
      <FitMap graph={graph} selected={selected} route={route} />
      {graph.roads.map((road) => {
        const from = nodes.get(road.from)
        const to = nodes.get(road.to)
        if (!from || !to) return null
        return <Polyline key={road.id} positions={[[from.lat, from.lng], [to.lat, to.lng]]} pathOptions={{
          color: blocked.has(road.id) && layers.hazards ? '#e17b74' : '#4c695f',
          dashArray: blocked.has(road.id) && layers.hazards ? '5 8' : undefined,
          weight: blocked.has(road.id) ? 2.5 : 2,
          opacity: 0.95,
        }} />
      })}
      {layers.hazards && graph.hazards.map((hazard) => <Polygon key={hazard.id} positions={hazard.polygon.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: '#ef7169', fillColor: '#f16a66', fillOpacity: 0.18, weight: 1.5, dashArray: '4 5' }}><Tooltip>{hazard.label}</Tooltip></Polygon>)}
      {graph.nodes.map((node) => <CircleMarker key={node.id} center={[node.lat, node.lng]} radius={3} pathOptions={{ fillColor: '#b0c2bb', fillOpacity: 1, color: '#294136', weight: 0.75 }}><Tooltip>{node.label}</Tooltip></CircleMarker>)}
      {route?.reachable && route.path.length > 1 && <Polyline positions={route.path.map(({ lat, lng }) => [lat, lng])} pathOptions={{ color: '#a9df94', weight: 4, opacity: 0.95 }} />}
      {layers.shelters && shelters.map((shelter) => <CircleMarker key={shelter.id} center={[shelter.lat, shelter.lng]} radius={6} pathOptions={{ color: '#152b22', weight: 2, fillColor: '#c5b7ed', fillOpacity: 1 }}><Tooltip>{shelter.name}</Tooltip></CircleMarker>)}
      {layers.units && units.map((unit) => <CircleMarker key={unit.id} center={[unit.lat, unit.lng]} radius={7} pathOptions={{ color: '#152b22', weight: 2, fillColor: unit.status === 'BUSY' ? '#8daca1' : '#6ed3ad', fillOpacity: 1 }}><Tooltip>{unit.name}</Tooltip></CircleMarker>)}
      {layers.incidents && incidents.map((item) => <CircleMarker
        key={item.id} center={[item.lat, item.lng]} radius={item.id === selected?.id ? 10 : 7}
        pathOptions={{ color: item.id === selected?.id ? '#ffffff' : '#152b22', weight: item.id === selected?.id ? 2.5 : 2, fillColor: severityColors[item.severity], fillOpacity: 1 }}
        eventHandlers={{ click: () => onSelect?.(item.id) }}
      ><Tooltip>{item.summary}</Tooltip></CircleMarker>)}
      <MapControls graph={graph} />
    </MapContainer>
    <div className="map-label"><span className="map-label-dot" />Bengaluru <span>·</span> Synthetic network</div>
    <button type="button" className="layers-button" aria-expanded={showLayers} onClick={() => setShowLayers(!showLayers)}><Layers3 size={15} /> Layers</button>
    {showLayers && <div className="map-layers">
      {Object.entries(layers).map(([layer, enabled]) => <label key={layer}><input type="checkbox" checked={enabled} onChange={(event) => setLayers({ ...layers, [layer]: event.target.checked })} />{layer}</label>)}
    </div>}
    <div className="map-legend" aria-label="Map legend">
      <span><i style={{ background: '#ff7178' }} /> SOS</span>
      <span><i style={{ background: '#6ed3ad' }} /> Unit</span>
      <span><i style={{ background: '#c5b7ed' }} /> Shelter</span>
      <span><i className="map-legend-hazard" /> Flood zone</span>
    </div>
  </div>
}
