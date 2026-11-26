export const streetSnapshotPath = "/geography/bengaluru-v1.json"

export type StreetPosition = [number, number]

type StreetLandmark = {
  id: string
  name: string
  position: StreetPosition
  vertex: number
  osmUrl: string
}

type StreetRoad = {
  name: string | null
  kind: string
  path: StreetPosition[]
}

export type StreetRoute = {
  path: StreetPosition[]
  distanceMeters: number
}

type StreetEdge = [from: number, to: number, distanceMeters: number]

export type StreetNetwork = {
  bounds: [StreetPosition, StreetPosition]
  landmarks: StreetLandmark[]
  source: {
    name: string
    url: string
    license: string
    licenseUrl: string
    capturedAt: string
    dataUrl: string
  }
  roads: StreetRoad[]
  vertices: StreetPosition[]
  edges: StreetEdge[]
  forbiddenTurns: number[][]
}

type StreetSnapshot = Omit<StreetNetwork, "roads"> & {
  roads: (Omit<StreetRoad, "path"> & { vertices: number[] })[]
}

export async function loadStreetNetwork(signal?: AbortSignal): Promise<StreetNetwork> {
  const response = await fetch(streetSnapshotPath, { signal })
  if (!response.ok) throw new Error("The Bengaluru street snapshot could not be loaded.")
  const snapshot: StreetSnapshot = await response.json()
  return {
    ...snapshot,
    roads: snapshot.roads.map(({ name, kind, vertices }) => ({
      name,
      kind,
      path: vertices.map((vertex) => snapshot.vertices[vertex]),
    })),
  }
}

type TurnNode = {
  id: number
  forbidden: boolean
  next: Map<number, TurnNode>
}

type StreetGraph = {
  outgoing: number[][]
  turnStarts: Map<number, TurnNode>
}

const streetGraphs = new WeakMap<StreetNetwork, StreetGraph>()

function graphFor(network: StreetNetwork): StreetGraph {
  const cached = streetGraphs.get(network)
  if (cached) return cached

  const outgoing = network.vertices.map((): number[] => [])
  network.edges.forEach(([from], index) => outgoing[from].push(index))
  const turnStarts = new Map<number, TurnNode>()
  let nextTurnId = 0
  for (const turn of network.forbiddenTurns) {
    let choices = turnStarts
    for (const [step, edge] of turn.entries()) {
      let prefix = choices.get(edge)
      if (!prefix) {
        prefix = { id: nextTurnId++, forbidden: false, next: new Map() }
        choices.set(edge, prefix)
      }
      if (step === turn.length - 1) prefix.forbidden = true
      choices = prefix.next
    }
  }
  const graph = { outgoing, turnStarts }
  streetGraphs.set(network, graph)
  return graph
}

type RouteCandidate = {
  vertex: number
  distance: number
  turns: TurnNode[]
  previous: RouteCandidate | null
}

function enqueue(queue: RouteCandidate[], candidate: RouteCandidate): void {
  let index = queue.length
  queue.push(candidate)
  while (index > 0) {
    const parent = (index - 1) >> 1
    if (queue[parent].distance <= candidate.distance) break
    queue[index] = queue[parent]
    index = parent
  }
  queue[index] = candidate
}

function dequeue(queue: RouteCandidate[]): RouteCandidate {
  const first = queue[0]
  const last = queue.pop()!
  let index = 0
  while (index * 2 + 1 < queue.length) {
    let child = index * 2 + 1
    if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance) child++
    if (last.distance <= queue[child].distance) break
    queue[index] = queue[child]
    index = child
  }
  if (queue.length > 0) queue[index] = last
  return first
}

function routeKey(vertex: number, turns: TurnNode[]): number | string {
  return turns.length ? vertex + "/" + turns.map(({ id }) => id).join(",") : vertex
}

export function findStreetRoute(
  network: StreetNetwork,
  fromId: string,
  toId: string,
): StreetRoute | null {
  const from = network.landmarks.find(({ id }) => id === fromId)
  const to = network.landmarks.find(({ id }) => id === toId)
  if (!from || !to) return null

  const { outgoing, turnStarts } = graphFor(network)
  const queue: RouteCandidate[] = [{ vertex: from.vertex, distance: 0, turns: [], previous: null }]
  const bestDistances = new Map<number | string, number>([[from.vertex, 0]])
  while (queue.length > 0) {
    const current = dequeue(queue)
    if (current.distance !== bestDistances.get(routeKey(current.vertex, current.turns))) continue
    if (current.vertex === to.vertex) {
      const path: StreetPosition[] = []
      for (let step: RouteCandidate | null = current; step; step = step.previous) {
        path.push(network.vertices[step.vertex])
      }
      return { path: path.reverse(), distanceMeters: current.distance }
    }

    for (const edgeIndex of outgoing[current.vertex]) {
      const [, vertex, length] = network.edges[edgeIndex]
      // Preserve only restriction prefixes that match the end of this route.
      const turns = current.turns.flatMap((prefix) => {
        const next = prefix.next.get(edgeIndex)
        return next ? [next] : []
      })
      const turnStart = turnStarts.get(edgeIndex)
      if (turnStart) turns.push(turnStart)
      if (turns.some((turn) => turn.forbidden)) continue

      const key = routeKey(vertex, turns)
      const distance = current.distance + length
      if (distance >= (bestDistances.get(key) ?? Infinity)) continue
      bestDistances.set(key, distance)
      enqueue(queue, { vertex, distance, turns, previous: current })
    }
  }
  return null
}
