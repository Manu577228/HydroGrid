export type Role = 'COORDINATOR' | 'RESPONDER' | 'SHELTER' | 'CITIZEN'
export type Hazard = 'FLOOD' | 'MEDICAL' | 'LANDSLIDE' | 'INFRASTRUCTURE' | 'OTHER'
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IncidentStatus = 'REPORTED' | 'ASSIGNED' | 'EN_ROUTE' | 'ON_SCENE' | 'RESOLVED'
export type Coordinates = { lat: number; lng: number }
export type IncidentInput = Coordinates & {
  clientId: string
  summary: string
  hazard: Hazard
  people: number
  medical: boolean
  vulnerable: boolean
  depthCm: number
  immediateDanger: boolean
  reportedSeverity: Severity
}
export type Incident = IncidentInput & {
  id: string
  nodeId: string
  status: IncidentStatus
  severity: Severity
  score: number
  reasons: { label: string; points: number }[]
  createdAt: string
  assignedUnitId: string | null
  groupId: string | null
}
export type Unit = Coordinates & {
  id: string
  name: string
  nodeId: string
  capacity: number
  equipment: string[] | string
  status: 'AVAILABLE' | 'BUSY'
}
export type RoadNode = Coordinates & { id: string; label: string }
export type Road = { id: string; from: string; to: string; distanceKm: number; speedKph: number }
export type HazardZone = { id: string; label: string; polygon: Coordinates[] }
export type Graph = {
  nodes: RoadNode[]
  roads: Road[]
  hazards: HazardZone[]
  floodZones?: HazardZone[]
  blockedRoadIds: string[]
  intensity: number
}
export type Route = {
  reachable: boolean
  nodeIds: string[]
  roadIds: string[]
  path: Coordinates[]
  distanceKm: number
  travelMinutes: number
}
export type Candidate = { unitId: string; route: Route; spareCapacity: number; rank: number }
export type Recommendations = { candidates: Candidate[]; multiUnitRequired: boolean; reason: string }
export type TimelineEvent = { id: string; incidentId: string; type: string; detail: string; createdAt: string }
export type Cluster = { incidentIds: string[]; distanceMeters: number }
export type Shelter = Coordinates & {
  id: string
  name: string
  type: 'RELIEF' | 'MEDICAL'
  capacity: number
  reserved: number
  admitted: number
  available: number
}
export type Reservation = { id: string; shelterId: string; incidentId: string | null; people: number; status: 'RESERVED' | 'ADMITTED' }
export type Scenario = { seed: number; incidents: number; units: number; floodIntensity: number; networkDisruption: number }
export type SimulationMetrics = {
  averageResponseMinutes: number | null
  criticalServedPercent: number
  utilizationPercent: number
  unservedIncidents: number
  servedIncidents: number
  criticalServed: number
  criticalIncidents: number
}
export type SimulationIncident = { id: string; nodeId: string; severity: Severity; people: number; createdMinute: number; availableMinute: number; offline: boolean }
export type SimulationUnit = { id: string; nodeId: string; capacity: number; equipment: string[] }
export type SimulationDispatch = { incidentId: string; unitId: string; fromNodeId: string; toNodeId: string; dispatchMinute: number; arrivalMinute: number; availableAgainMinute: number; route: Route }
export type Simulation = {
  scenario: Scenario
  summary: { horizonMinutes: number; offlineReports: number; blockedRoadIds: string[]; activeFloodZoneIds: string[] }
  baseline: SimulationMetrics
  hydroGrid: SimulationMetrics
  incidents: SimulationIncident[]
  units: SimulationUnit[]
  baselineDispatches: SimulationDispatch[]
  hydroGridDispatches: SimulationDispatch[]
}
export type QueueRecord = {
  clientId: string
  session: string
  kind: 'report' | 'mission'
  payload: IncidentInput | { incidentId: string; status: IncidentStatus }
  createdAt: number
  status: 'pending' | 'sent' | 'failed'
  error?: string
  sentId?: string
}
