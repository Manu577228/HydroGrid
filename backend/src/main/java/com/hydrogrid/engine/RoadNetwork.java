package com.hydrogrid.engine;

import com.hydrogrid.engine.HydroEngine.FloodZone;
import com.hydrogrid.engine.HydroEngine.Graph;
import com.hydrogrid.engine.HydroEngine.Location;
import com.hydrogrid.engine.HydroEngine.Node;
import com.hydrogrid.engine.HydroEngine.Road;
import com.hydrogrid.engine.HydroEngine.Route;

import java.awt.geom.Line2D;
import java.awt.geom.Path2D;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

final class RoadNetwork {
    private static final Route UNREACHABLE = new Route(false, List.of(), List.of(), List.of(), 0, 0);

    private final List<Node> nodes = List.of(
            new Node("N01", "West Logistics", 12.9876, 77.6000),
            new Node("N02", "North Junction", 12.9894, 77.6107),
            new Node("N03", "High Ground", 12.9883, 77.6210),
            new Node("N04", "East Depot", 12.9890, 77.6320),
            new Node("N05", "Civic Hall", 12.9796, 77.5988),
            new Node("N06", "Market Cross", 12.9806, 77.6092),
            new Node("N07", "Canal Bridge", 12.9788, 77.6194),
            new Node("N08", "Medical Hub", 12.9804, 77.6300),
            new Node("N09", "West Gate", 12.9690, 77.5980),
            new Node("N10", "South Junction", 12.9707, 77.6081),
            new Node("N11", "Riverside", 12.9719, 77.6188),
            new Node("N12", "East Bank", 12.9696, 77.6302),
            new Node("N13", "West Shelter", 12.9608, 77.6000),
            new Node("N14", "South Clinic", 12.9623, 77.6099),
            new Node("N15", "Lake Approach", 12.9608, 77.6211),
            new Node("N16", "South Depot", 12.9610, 77.6322));

    private final List<FloodZone> floodZones = List.of(
            new FloodZone("F01", "Canal overflow", List.of(
                    new Location(12.9784, 77.6138), new Location(12.9778, 77.6167),
                    new Location(12.9804, 77.6170), new Location(12.9810, 77.6157),
                    new Location(12.9806, 77.6140))),
            new FloodZone("F02", "Riverside inundation", List.of(
                    new Location(12.9698, 77.6155), new Location(12.9689, 77.6212),
                    new Location(12.9731, 77.6234), new Location(12.9746, 77.6187),
                    new Location(12.9734, 77.6152))),
            new FloodZone("F03", "East Bank overflow", List.of(
                    new Location(12.9729, 77.6271), new Location(12.9724, 77.6322),
                    new Location(12.9771, 77.6328), new Location(12.9781, 77.6281),
                    new Location(12.9752, 77.6262))));

    private final Map<String, Node> nodeById = new LinkedHashMap<>();
    private final Map<String, List<Road>> connections = new HashMap<>();
    private final Graph graph;

    RoadNetwork() {
        for (Node node : nodes) {
            nodeById.put(node.id(), node);
            connections.put(node.id(), new ArrayList<>());
        }
        var roads = new ArrayList<Road>();
        addRoad(roads, 1, 2, 33);
        addRoad(roads, 2, 3, 36);
        addRoad(roads, 3, 4, 32);
        addRoad(roads, 5, 6, 27);
        addRoad(roads, 6, 7, 34);
        addRoad(roads, 7, 8, 31);
        addRoad(roads, 9, 10, 28);
        addRoad(roads, 10, 11, 31);
        addRoad(roads, 11, 12, 30);
        addRoad(roads, 13, 14, 33);
        addRoad(roads, 14, 15, 31);
        addRoad(roads, 15, 16, 30);
        addRoad(roads, 1, 5, 27);
        addRoad(roads, 2, 6, 30);
        addRoad(roads, 3, 7, 32);
        addRoad(roads, 4, 8, 29);
        addRoad(roads, 5, 9, 26);
        addRoad(roads, 6, 10, 31);
        addRoad(roads, 7, 11, 24);
        addRoad(roads, 8, 12, 28);
        addRoad(roads, 9, 13, 28);
        addRoad(roads, 10, 14, 30);
        addRoad(roads, 11, 15, 25);
        addRoad(roads, 12, 16, 28);
        addRoad(roads, 2, 7, 27);
        addRoad(roads, 6, 11, 25);
        addRoad(roads, 10, 15, 27);
        addRoad(roads, 7, 12, 25);
        addRoad(roads, 5, 10, 23);
        addRoad(roads, 3, 8, 27);
        graph = new Graph(nodes, List.copyOf(roads), floodZones);
    }

    Graph graph() {
        return graph;
    }

    List<FloodZone> activeFloodZones(int intensity) {
        if (intensity < 0 || intensity > 100) {
            throw new IllegalArgumentException("Flood intensity must be between 0 and 100.");
        }
        if (intensity == 0) {
            return List.of();
        }
        if (intensity < 45) {
            return floodZones.subList(0, 1);
        }
        if (intensity < 75) {
            return floodZones.subList(0, 2);
        }
        return floodZones;
    }

    Set<String> blockedRoads(List<FloodZone> activeFloodZones) {
        var blocked = new LinkedHashSet<String>();
        for (Road road : graph.roads()) {
            Node from = nodeById.get(road.from());
            Node to = nodeById.get(road.to());
            for (FloodZone floodZone : activeFloodZones) {
                if (intersects(from, to, floodZone.polygon())) {
                    blocked.add(road.id());
                    break;
                }
            }
        }
        return Set.copyOf(blocked);
    }

    Route route(String from, String to, Set<String> blockedRoadIds) {
        if (!nodeById.containsKey(from) || !nodeById.containsKey(to)) {
            return UNREACHABLE;
        }
        var queue = new PriorityQueue<Arrival>(Comparator.comparingDouble(Arrival::minutes).thenComparing(Arrival::nodeId));
        var travelMinutes = new HashMap<String, Double>();
        var previous = new HashMap<String, Road>();
        queue.add(new Arrival(from, 0));
        travelMinutes.put(from, 0.0);
        while (!queue.isEmpty()) {
            Arrival current = queue.remove();
            if (current.minutes() > travelMinutes.get(current.nodeId())) {
                continue;
            }
            if (current.nodeId().equals(to)) {
                return reconstruct(from, to, current.minutes(), previous);
            }
            for (Road road : connections.get(current.nodeId())) {
                if (blockedRoadIds.contains(road.id())) {
                    continue;
                }
                String next = otherEnd(road, current.nodeId());
                double nextMinutes = current.minutes() + road.distanceKm() * 60 / road.speedKph();
                if (nextMinutes < travelMinutes.getOrDefault(next, Double.POSITIVE_INFINITY)) {
                    travelMinutes.put(next, nextMinutes);
                    previous.put(next, road);
                    queue.add(new Arrival(next, nextMinutes));
                }
            }
        }
        return UNREACHABLE;
    }

    private Route reconstruct(String from, String to, double minutes, Map<String, Road> previous) {
        var routeNodes = new ArrayList<String>();
        var routeRoads = new ArrayList<String>();
        double kilometers = 0;
        String current = to;
        routeNodes.add(current);
        while (!current.equals(from)) {
            Road road = previous.get(current);
            routeRoads.add(road.id());
            kilometers += road.distanceKm();
            current = otherEnd(road, current);
            routeNodes.add(current);
        }
        List<String> nodeIds = List.copyOf(routeNodes.reversed());
        List<Location> path = nodeIds.stream().map(nodeById::get).map(node -> new Location(node.lat(), node.lng())).toList();
        return new Route(true, nodeIds, List.copyOf(routeRoads.reversed()), path,
                HydroEngine.round(kilometers, 2), HydroEngine.round(minutes, 2));
    }

    private static String otherEnd(Road road, String nodeId) {
        return road.from().equals(nodeId) ? road.to() : road.from();
    }

    private void addRoad(List<Road> roads, int fromIndex, int toIndex, int speed) {
        Node from = nodes.get(fromIndex - 1);
        Node to = nodes.get(toIndex - 1);
        // Approximate graph travel lengths include a small margin for bends between waypoints.
        double distance = HydroEngine.round(greatCircleKm(from, to) * 1.12, 3);
        Road road = new Road(String.format(Locale.ROOT, "R%02d", roads.size() + 1), from.id(), to.id(), distance, speed);
        roads.add(road);
        connections.get(from.id()).add(road);
        connections.get(to.id()).add(road);
    }

    private static double greatCircleKm(Node from, Node to) {
        double latDelta = Math.toRadians(to.lat() - from.lat());
        double lngDelta = Math.toRadians(to.lng() - from.lng());
        double latTerm = Math.sin(latDelta / 2);
        double lngTerm = Math.sin(lngDelta / 2);
        double chord = latTerm * latTerm + Math.cos(Math.toRadians(from.lat())) * Math.cos(Math.toRadians(to.lat()))
                * lngTerm * lngTerm;
        return 12_742 * Math.asin(Math.sqrt(chord));
    }

    private static boolean intersects(Node from, Node to, List<Location> polygon) {
        Path2D footprint = new Path2D.Double();
        Location first = polygon.getFirst();
        footprint.moveTo(first.lng(), first.lat());
        Location previous = polygon.getLast();
        for (Location current : polygon) {
            if (Line2D.linesIntersect(from.lng(), from.lat(), to.lng(), to.lat(),
                    previous.lng(), previous.lat(), current.lng(), current.lat())) {
                return true;
            }
            footprint.lineTo(current.lng(), current.lat());
            previous = current;
        }
        footprint.closePath();
        return footprint.contains(from.lng(), from.lat()) || footprint.contains(to.lng(), to.lat());
    }

    private record Arrival(String nodeId, double minutes) {}
}
