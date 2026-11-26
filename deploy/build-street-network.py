#!/usr/bin/env python3
"""Build HydroGrid's Bengaluru road preview from an OpenStreetMap API XML snapshot."""

import argparse
import json
import math
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from datetime import datetime
from pathlib import Path

ROAD_KINDS = {
    "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "trunk_link", "primary_link", "secondary_link",
    "tertiary_link",
}
VEHICLE_ACCESS = ("motorcar", "motor_vehicle", "vehicle", "access")
PUBLIC_ACCESS = {"yes", "permissive", "designated"}
LANDMARKS = (
    ("cubbon-park", "Cubbon Park Metro", "node", "4979669577"),
    ("vidhana-soudha", "Vidhana Soudha", "node", "7140581382"),
    ("chinnaswamy-stadium", "M. Chinnaswamy Stadium", "node", "6834406267"),
    ("visvesvaraya-museum", "Visvesvaraya Museum", "way", "327551780"),
    ("ub-city", "UB City", "way", "38773290"),
    ("mg-road", "MG Road Metro", "node", "11215576585"),
    ("richmond-circle", "Richmond Circle", "node", "7136947081"),
)


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def first_tag(properties, keys):
    return next((properties[key] for key in keys if key in properties), None)


def permits_cars(properties):
    access = first_tag(properties, VEHICLE_ACCESS)
    return (access is None or access in PUBLIC_ACCESS) and not any(
        key + ":conditional" in properties for key in VEHICLE_ACCESS
    )


def direction(properties):
    keys = ("oneway:motorcar", "oneway:motor_vehicle", "oneway:vehicle", "oneway")
    if any(key + ":conditional" in properties for key in keys):
        return None
    explicit = first_tag(properties, keys)
    if explicit is None:
        return 1 if properties.get("junction") in {"roundabout", "circular"} else 0
    if explicit in {"yes", "true", "1"}:
        return 1
    if explicit in {"no", "false", "0"}:
        return 0
    if explicit == "-1":
        return -1
    return None


def way_nodes(element):
    return [node.attrib["ref"] for node in element.findall("nd")]


def meters(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    delta_lon = math.radians(b[1] - a[1])
    h = math.sin((lat2 - lat1) / 2) ** 2
    h += math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(min(h, 1)))


def reachable(start, neighbors):
    seen = {start}
    pending = deque([start])
    while pending:
        for neighbor in neighbors[pending.popleft()]:
            if neighbor not in seen:
                seen.add(neighbor)
                pending.append(neighbor)
    return seen


def turn_sequences(relations, edges, osm_vertices):
    """Resolve mapped turn restrictions to sequences of contiguous directed edges."""
    outgoing = defaultdict(list)
    by_way = defaultdict(list)
    for edge_index, (start, _, _, way) in enumerate(edges):
        outgoing[start].append(edge_index)
        by_way[way].append(edge_index)

    banned = set()
    for relation in relations:
        properties = tags(relation)
        if properties.get("type") not in {
            "restriction", "restriction:motorcar", "restriction:motor_vehicle",
        }:
            continue
        exceptions = properties.get("except", "").split(";")
        if any(vehicle.strip() in VEHICLE_ACCESS[:3] for vehicle in exceptions):
            continue
        rule = first_tag(properties, ("restriction:motorcar", "restriction:motor_vehicle", "restriction"))
        if not rule or not rule.startswith(("no_", "only_")):
            continue

        members = defaultdict(list)
        for member in relation.findall("member"):
            members[member.attrib["role"]].append((member.attrib["type"], member.attrib["ref"]))
        via = members["via"]
        from_ways = {ref for kind, ref in members["from"] if kind == "way"}
        to_ways = {ref for kind, ref in members["to"] if kind == "way"}
        if not via or not from_ways or not to_ways:
            continue

        def finish(path, vertex):
            for next_edge in outgoing[vertex]:
                _, destination, _, next_way = edges[next_edge]
                matches = next_way in to_ways
                if rule == "no_u_turn" and len(path) == 1 and next_way in from_ways:
                    matches = matches and destination == edges[path[0]][0]
                if matches == rule.startswith("no_"):
                    banned.add((*path, next_edge))

        if len(via) == 1 and via[0][0] == "node":
            vertex = osm_vertices.get(via[0][1])
            if vertex is None:
                continue
            for from_way in from_ways:
                for edge_index in by_way[from_way]:
                    if edges[edge_index][1] == vertex:
                        finish((edge_index,), vertex)
            continue

        if any(kind != "way" for kind, _ in via):
            continue
        via_ways = [ref for _, ref in via]
        for from_way in from_ways:
            for edge_index in by_way[from_way]:
                pending = [((edge_index,), 0)]
                while pending:
                    path, step = pending.pop()
                    current_way = edges[path[-1]][3]
                    vertex = edges[path[-1]][1]
                    if current_way == via_ways[-1] and step == len(via_ways):
                        if any(edges[index][3] in to_ways for index in outgoing[vertex]):
                            finish(path, vertex)
                    for next_edge in outgoing[vertex]:
                        if next_edge in path:
                            continue
                        next_way = edges[next_edge][3]
                        if step < len(via_ways) and next_way == via_ways[step]:
                            pending.append(((*path, next_edge), step + 1))
                        elif step > 0 and next_way == via_ways[step - 1]:
                            pending.append(((*path, next_edge), step))

    return sorted(banned)


def build_network(xml, captured_at):
    raw_bounds = xml.find("bounds").attrib
    south, west, north, east = (
        float(raw_bounds[key]) for key in ("minlat", "minlon", "maxlat", "maxlon")
    )
    positions = {}
    barriers = set()
    for node in xml.findall("node"):
        osm_id = node.attrib["id"]
        positions[osm_id] = [float(node.attrib["lat"]), float(node.attrib["lon"])]
        properties = tags(node)
        barrier = properties.get("barrier")
        explicitly_open = first_tag(properties, VEHICLE_ACCESS) in PUBLIC_ACCESS
        if not permits_cars(properties) or (barrier not in {None, "cattle_grid", "border_control", "toll_booth"} and not explicitly_open):
            barriers.add(osm_id)

    vertices = []
    osm_vertices = {}
    roads = []
    edges = []
    ways = {}
    forward, backward = defaultdict(list), defaultdict(list)

    def vertex_for(osm_id):
        if osm_id not in osm_vertices:
            osm_vertices[osm_id] = len(vertices)
            vertices.append(positions[osm_id])
        return osm_vertices[osm_id]

    def add_edge(start, end, distance, way_id):
        edges.append((start, end, distance, way_id))
        forward[start].append(end)
        backward[end].append(start)

    for way in xml.findall("way"):
        way_id = way.attrib["id"]
        nodes = way_nodes(way)
        ways[way_id] = nodes
        properties = tags(way)
        road_kind = properties.get("highway")
        driving_direction = direction(properties)
        if road_kind not in ROAD_KINDS or not permits_cars(properties) or driving_direction is None:
            continue
        if properties.get("service") in {"driveway", "parking_aisle", "drive-through", "emergency_access"}:
            continue

        section = []
        for osm_id in nodes:
            position = positions.get(osm_id)
            if position is None or osm_id in barriers or not (south <= position[0] <= north and west <= position[1] <= east):
                if len(section) > 1:
                    roads.append({"name": properties.get("name:en") or properties.get("name"), "kind": road_kind, "vertices": section})
                section = []
                continue
            vertex = vertex_for(osm_id)
            if section:
                last = section[-1]
                length = round(meters(vertices[last], vertices[vertex]), 2)
                if length:
                    if driving_direction >= 0:
                        add_edge(last, vertex, length, way_id)
                    if driving_direction <= 0:
                        add_edge(vertex, last, length, way_id)
            if not section or section[-1] != vertex:
                section.append(vertex)
        if len(section) > 1:
            roads.append({"name": properties.get("name:en") or properties.get("name"), "kind": road_kind, "vertices": section})

    def landmark_position(kind, osm_id):
        if kind == "node":
            return positions[osm_id]
        refs = list(dict.fromkeys(ways[osm_id]))
        return [round(sum(positions[ref][index] for ref in refs) / len(refs), 7) for index in (0, 1)]

    anchor = landmark_position("node", LANDMARKS[0][3])
    candidates = sorted(set(forward) & set(backward), key=lambda vertex: meters(vertices[vertex], anchor))
    component = set()
    for seed in candidates[:12]:
        if seed not in component:
            reachable_both = reachable(seed, forward) & reachable(seed, backward)
            if len(reachable_both) > len(component):
                component = reachable_both
    if len(component) < 100:
        raise ValueError("The extract did not yield a connected road network near Cubbon Park")

    landmarks = []
    for place_id, name, kind, osm_id in LANDMARKS:
        position = landmark_position(kind, osm_id)
        vertex = min(component, key=lambda candidate: (meters(vertices[candidate], position), candidate))
        landmarks.append({
            "id": place_id, "name": name, "position": position, "vertex": vertex,
            "osmUrl": f"https://www.openstreetmap.org/{kind}/{osm_id}",
        })

    forbidden = turn_sequences(xml.findall("relation"), edges, osm_vertices)
    return {
        "bounds": [[south, west], [north, east]],
        "source": {
            "name": "OpenStreetMap contributors",
            "url": "https://www.openstreetmap.org/copyright",
            "license": "ODbL 1.0",
            "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
            "capturedAt": captured_at,
            "dataUrl": f"https://api.openstreetmap.org/api/0.6/map?bbox={west:g},{south:g},{east:g},{north:g}",
        },
        "landmarks": landmarks,
        "roads": roads,
        "vertices": vertices,
        "edges": [edge[:3] for edge in edges],
        "forbiddenTurns": forbidden,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="OpenStreetMap API 0.6 XML extract")
    parser.add_argument("--captured-at", required=True, help="UTC timestamp of the original download")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "frontend/public/geography/bengaluru-v1.json")
    arguments = parser.parse_args()
    timestamp = datetime.fromisoformat(arguments.captured_at.replace("Z", "+00:00"))
    if timestamp.utcoffset() is None:
        parser.error("--captured-at must include a timezone")
    network = build_network(ET.parse(arguments.input).getroot(), arguments.captured_at)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(network, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(network['roads'])} road sections, {len(network['vertices'])} vertices, {len(network['edges'])} directed segments, {len(network['forbiddenTurns'])} turn constraints, {len(network['landmarks'])} landmarks")


if __name__ == "__main__":
    main()
