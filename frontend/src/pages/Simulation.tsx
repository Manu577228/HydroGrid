import { useMutation, useQuery } from '@tanstack/react-query'
import { Activity, Ambulance, BusFront, Clock, Droplets, FlaskConical, Hash, MapPin, MapPinned, Pause, Play, RotateCcw, Route as RouteIcon, Siren, SlidersHorizontal, WifiOff, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, client } from '../api'
import { Benchmark, latestSimulationKey } from '../components/Benchmark'
import { OperatingMap } from '../components/Map'
import { Button, Empty, ErrorNotice, Loading, PageTitle, PanelTitle } from '../components/ui'
import { useNetwork } from '../network'
import type { Graph, Scenario, Simulation, SimulationDispatch } from '../types'

const benchmarkStorageKey = 'hydrogrid-last-benchmark'
function savedBenchmark(): Simulation | undefined {
  try {
    const raw = localStorage.getItem(benchmarkStorageKey)
    if (!raw) return undefined
    const result = JSON.parse(raw) as Simulation
    if (!result.scenario || !result.summary || !Array.isArray(result.baselineDispatches) || !Array.isArray(result.hydroGridDispatches)) return undefined
    return result
  } catch {
    return undefined
  }
}

const defaultScenario: Scenario = { seed: 1337, incidents: 100, units: 15, floodIntensity: 40, networkDisruption: 30 }

function Range({ label, value, max, min = 0, suffix = '', onChange, icon: Icon }: {
  label: string; value: number; min?: number; max: number; suffix?: string; onChange: (value: number) => void; icon: LucideIcon
}) {
  return <label className="range-field">
    <span><span className="inline-flex items-center gap-2"><Icon size={15} aria-hidden="true" /> {label}</span><strong aria-hidden="true">{value}{suffix}</strong></span>
    <input type="range" min={min} max={max} value={value} aria-valuetext={String(value) + suffix} onChange={(event) => onChange(Number(event.target.value))} />
  </label>
}

export function SimulationPage() {
  const { offline } = useNetwork()
  const [scenario, setScenario] = useState<Scenario>(defaultScenario)
  const [from, setFrom] = useState('N06')
  const [to, setTo] = useState('N07')
  const [minute, setMinute] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [strategy, setStrategy] = useState<'hydroGrid' | 'baseline'>('hydroGrid')
  const [routeFlood, setRouteFlood] = useState(40)
  const graph = useQuery({ queryKey: ['graph'], queryFn: () => api.graph(), enabled: !offline })
  const route = useQuery({ queryKey: ['route', from, to], queryFn: () => api.route(from, to), enabled: !offline })
  const results = useQuery<Simulation>({ queryKey: latestSimulationKey, queryFn: () => client.getQueryData(latestSimulationKey)!, enabled: false, gcTime: Infinity, initialData: savedBenchmark })
  const result = results.data
  const run = useMutation({
    mutationFn: api.simulation,
    onSuccess: (data) => {
      client.setQueryData(latestSimulationKey, data)
      const serialized = JSON.stringify(data)
      if (serialized.length < 1_000_000) {
        try { localStorage.setItem(benchmarkStorageKey, serialized) } catch {
          // The result remains available for this tab and can still be exported.
        }
      }
      setMinute(0)
      setPlaying(false)
    },
  })
  const applyFlood = useMutation({
    mutationFn: api.hazards,
    onSuccess: async (data) => {
      client.setQueryData(['graph'], data)
      await client.invalidateQueries({ predicate: (query) => ['graph', 'route', 'recommendations'].includes(String(query.queryKey[0])) })
    },
  })
  const horizon = result?.summary.horizonMinutes ?? 0
  useEffect(() => {
    if (!playing || !horizon) return
    const timer = window.setInterval(() => setMinute((previous) => Math.min(horizon, previous + 1)), 100)
    return () => window.clearInterval(timer)
  }, [playing, horizon])
  useEffect(() => { if (playing && minute >= horizon) setPlaying(false) }, [minute, horizon, playing])
  const playback = useMemo(() => result && graph.data ? scenarioMap(result, graph.data, strategy, minute) : undefined, [result, graph.data, strategy, minute])
  const update = (key: keyof Scenario, value: number) => setScenario((previous) => ({ ...previous, [key]: value }))

  return <>
    <PageTitle icon={<FlaskConical size={24} aria-hidden="true" />} title="Simulation laboratory" description="Set up an exercise, then see how two dispatch strategies handle the same flood." />
    {offline && <div className="notice"><WifiOff size={17} /> Reconnect to run a benchmark or change the shared hazard map.</div>}
    <div className="workspace-split simulation-top">
      <section className="panel">
        <PanelTitle icon={<SlidersHorizontal size={18} />} title="Scenario controls" detail="Set the size of the flood response exercise" />
        <form className="panel-body form-stack" onSubmit={(event) => { event.preventDefault(); run.mutate(scenario) }}>
          <label className="field-label"><span><Hash size={15} aria-hidden="true" /> Scenario seed</span><input type="number" min={-2147483648} max={2147483647} required value={scenario.seed} aria-describedby="scenario-seed-help" onChange={(event) => update('seed', Number(event.target.value))} /><small className="muted small" id="scenario-seed-help">Use the same seed and settings to repeat a run.</small></label>
          <Range icon={Siren} label="Emergency incidents" value={scenario.incidents} min={1} max={200} onChange={(value) => update('incidents', value)} />
          <Range icon={Ambulance} label="Rescue units" value={scenario.units} min={1} max={40} onChange={(value) => update('units', value)} />
          <Range icon={Droplets} label="Flood intensity" value={scenario.floodIntensity} max={100} suffix="%" onChange={(value) => update('floodIntensity', value)} />
          <Range icon={WifiOff} label="Chance of a report being delayed" value={scenario.networkDisruption} max={100} suffix="%" onChange={(value) => update('networkDisruption', value)} />
          <ErrorNotice error={run.error} />
          <div className="form-footer"><Button variant="outline" onClick={() => setScenario(defaultScenario)}><RotateCcw size={16} /> Reset scenario</Button><Button type="submit" disabled={run.isPending || offline}><FlaskConical size={17} /> {run.isPending ? 'Running simulation…' : 'Run simulation'}</Button></div>
        </form>
      </section>
      <section className="panel">
        <PanelTitle icon={<Activity size={18} />} title="Scenario playback" detail={result ? 'Seed ' + result.scenario.seed + ' · ' + result.summary.offlineReports + ' reports delayed' : 'Run a simulation to see the reports arrive and rescue teams move'} actions={result && <select className="standalone-select" aria-label="Playback strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}><option value="hydroGrid">HydroGrid · by urgency</option><option value="baseline">FIFO · by arrival order</option></select>} />
        {playback ? <OperatingMap graph={playback.graph} incidents={playback.incidents} units={playback.units} /> : graph.data ? <OperatingMap graph={graph.data} /> : offline ? <Empty>The scenario map loads when connected.</Empty> : graph.isError ? <ErrorNotice error={graph.error} /> : <Loading label="Loading road graph" />}
        {result && <div className="playback-controls">
          <Button variant="outline" size="icon" aria-label={playing ? 'Pause playback' : 'Play scenario'} onClick={() => { if (minute >= horizon) setMinute(0); setPlaying(!playing) }}>{playing ? <Pause size={16} /> : <Play size={16} />}</Button>
          <Range icon={Clock} label="Playback minute" value={minute} max={horizon} onChange={(value) => { setPlaying(false); setMinute(value) }} />
          <span>{playback?.incidents.length ?? 0} open reports</span>
        </div>}
      </section>
    </div>
    {result && <Benchmark result={result} />}
    <section className="panel">
      <PanelTitle icon={<MapPinned size={18} />} title="Flood route demonstration" detail="Raise the flood level to close roads and see where a rescue team can still travel." />
      <div className="panel-body route-demo-grid">
        <div className="form-stack">
          <div className="form-grid">
            <label className="field-label"><span><RouteIcon size={15} aria-hidden="true" /> Start</span><select value={from} disabled={!graph.data} onChange={(event) => setFrom(event.target.value)}>{graph.data?.nodes.map((node) => <option value={node.id} key={node.id}>{node.label}</option>)}</select></label>
            <label className="field-label"><span><MapPin size={15} aria-hidden="true" /> Destination</span><select value={to} disabled={!graph.data} onChange={(event) => setTo(event.target.value)}>{graph.data?.nodes.map((node) => <option value={node.id} key={node.id}>{node.label}</option>)}</select></label>
          </div>
          <Range icon={Droplets} label="Shared map flood intensity" value={routeFlood} max={100} suffix="%" onChange={setRouteFlood} />
          <div className="form-footer"><Button variant="outline" disabled={offline || applyFlood.isPending} onClick={() => { setRouteFlood(0); applyFlood.mutate(0) }}>Clear flood</Button><Button disabled={offline || applyFlood.isPending} onClick={() => applyFlood.mutate(routeFlood)}><Droplets size={17} /> Apply flood intensity</Button></div>
          {route.data && <div className="route-summary"><RouteIcon size={18} /><div><strong>{route.data.reachable ? route.data.distanceKm.toFixed(2) + ' km · ' + route.data.travelMinutes.toFixed(1) + ' simulated minutes' : 'No accessible route'}</strong><small>{graph.data?.intensity ?? 0}% active flood intensity · {graph.data?.blockedRoadIds.length ?? 0} roads blocked</small></div></div>}
          <ErrorNotice error={applyFlood.error ?? route.error} />
        </div>
        {graph.data && <OperatingMap graph={graph.data} route={route.data} className="small-map" />}
      </div>
    </section>
    <div className="notice"><BusFront size={17} /> Scenario playback uses simulated demand, travel, and network interruptions. Its routes are for demonstration.</div>
  </>
}

function scenarioMap(result: Simulation, source: Graph, strategy: 'baseline' | 'hydroGrid', minute: number) {
  const active = new Set(result.summary.activeFloodZoneIds)
  const dispatches = strategy === 'baseline' ? result.baselineDispatches : result.hydroGridDispatches
  const byIncident = new Map(dispatches.map((dispatch) => [dispatch.incidentId, dispatch]))
  const latest = new Map<string, SimulationDispatch>()
  for (const dispatch of dispatches) {
    if (dispatch.dispatchMinute <= minute && (latest.get(dispatch.unitId)?.dispatchMinute ?? -1) <= dispatch.dispatchMinute) latest.set(dispatch.unitId, dispatch)
  }
  const nodes = new Map(source.nodes.map((node) => [node.id, node]))
  const graph = { ...source, blockedRoadIds: result.summary.blockedRoadIds, hazards: (source.floodZones ?? source.hazards).filter((zone) => active.has(zone.id)) }
  const incidents = result.incidents.flatMap((incident) => {
    const node = nodes.get(incident.nodeId)
    const dispatch = byIncident.get(incident.id)
    return node && incident.availableMinute <= minute && (!dispatch || dispatch.arrivalMinute > minute)
      ? [{ ...node, id: incident.id, summary: incident.severity + ' · ' + incident.people + ' people', severity: incident.severity }]
      : []
  })
  const units = result.units.flatMap((unit) => {
    const dispatch = latest.get(unit.id)
    const node = nodes.get(dispatch?.toNodeId ?? unit.nodeId)
    if (!node) return []
    return [{ ...node, ...(dispatch ? dispatchPosition(dispatch, minute) : {}), name: unit.id, id: unit.id, status: dispatch && dispatch.availableAgainMinute > minute ? 'BUSY' as const : 'AVAILABLE' as const }]
  })
  return { graph, units, incidents }
}

function dispatchPosition(dispatch: SimulationDispatch, minute: number) {
  const points = dispatch.route.path
  if (points.length < 2 || dispatch.arrivalMinute <= minute) return points.at(-1)
  const progress = (minute - dispatch.dispatchMinute) / Math.max(1, dispatch.arrivalMinute - dispatch.dispatchMinute) * (points.length - 1)
  const a = points[Math.floor(progress)]
  const b = points[Math.ceil(progress)]
  const fraction = progress % 1
  if (!a || !b) return points[0]
  return { lat: a.lat + (b.lat - a.lat) * fraction, lng: a.lng + (b.lng - a.lng) * fraction }
}
