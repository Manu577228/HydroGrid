package com.hydrogrid.engine;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;

public final class HydroEngine {
    private final RoadNetwork network = new RoadNetwork();

    public Graph graph() {
        return network.graph();
    }

    public List<FloodZone> activeFloodZones(int intensity) {
        return network.activeFloodZones(intensity);
    }

    public Set<String> blockedRoads(List<FloodZone> floodZones) {
        return network.blockedRoads(floodZones);
    }

    public Route route(String from, String to, Set<String> blockedRoadIds) {
        return network.route(from, to, blockedRoadIds);
    }

    public Triage triage(IncidentInput input) {
        return triage("LOW", input);
    }

    public Triage triage(String reportedSeverity, IncidentInput input) {
        Band reported = Band.parse(reportedSeverity);
        Band inferred = inferredBand(input);
        return score(reported.ordinal() >= inferred.ordinal() ? reported : inferred, input);
    }

    public Triage triageOverride(String severity, IncidentInput input) {
        return score(Band.parse(severity), input);
    }

    public Match match(String incidentNodeId, IncidentInput input, List<UnitInput> units,
                       Set<String> blockedRoadIds) {
        return match(incidentNodeId, input, units, (from, to) -> route(from, to, blockedRoadIds), true);
    }

    Match match(String incidentNodeId, IncidentInput input, List<UnitInput> units,
                BiFunction<String, String, Route> routes, boolean capacityAware) {
        var candidates = new ArrayList<Candidate>();
        boolean compatible = false;
        boolean reachable = false;
        boolean capacityLimited = false;
        for (UnitInput unit : units) {
            if (!unit.available() || !equippedFor(unit, input)) {
                continue;
            }
            compatible = true;
            Route route = routes.apply(unit.nodeId(), incidentNodeId);
            if (!route.reachable()) {
                continue;
            }
            reachable = true;
            int spareCapacity = unit.capacity() - input.people();
            if (spareCapacity < 0) {
                capacityLimited = true;
                continue;
            }
            double fit = capacityAware ? spareCapacity * 0.35 + specialistPenalty(unit, input) : 0;
            candidates.add(new Candidate(unit.id(), route, spareCapacity, round(route.travelMinutes() + fit, 3)));
        }
        candidates.sort(Comparator.comparingDouble(Candidate::rank)
                .thenComparingDouble(candidate -> candidate.route().travelMinutes())
                .thenComparing(Candidate::unitId));
        if (!candidates.isEmpty()) {
            return new Match(List.copyOf(candidates), false, "Eligible units ranked for this incident");
        }
        if (capacityLimited) {
            return new Match(List.of(), true, "Coordinate multiple units or trips to meet the reported headcount");
        }
        if (compatible && !reachable) {
            return new Match(List.of(), false, "Available equipped units have no open route");
        }
        return new Match(List.of(), false, "No available unit has the required equipment");
    }

    public Simulation simulate(ScenarioInput input) {
        return new DispatchSimulation(this).run(input);
    }

    private static Band inferredBand(IncidentInput input) {
        if (input.immediateDanger() || input.depthCm() >= 100) {
            return Band.CRITICAL;
        }
        if (isMedical(input) || input.depthCm() >= 55 || input.people() >= 8) {
            return Band.HIGH;
        }
        if (input.vulnerable() || input.depthCm() >= 20 || input.people() >= 4) {
            return Band.MEDIUM;
        }
        return Band.LOW;
    }

    private static Triage score(Band band, IncidentInput input) {
        var contributions = new ArrayList<Contribution>();
        contributions.add(new Contribution("Severity base", band.ordinal() * 100));
        addPoints(contributions, "People affected", Math.min(10, input.people()) * 2);
        addPoints(contributions, "Medical urgency", isMedical(input) ? 25 : 0);
        addPoints(contributions, "Vulnerable occupants", input.vulnerable() ? 15 : 0);
        addPoints(contributions, "Reported water depth", Math.min(8, input.depthCm() / 10));
        addPoints(contributions, "Waiting time", Math.min(30, input.waitingMinutes()));
        int score = contributions.stream().mapToInt(Contribution::points).sum();
        return new Triage(band.name(), score, List.copyOf(contributions));
    }

    private static void addPoints(List<Contribution> contributions, String label, int points) {
        if (points > 0) {
            contributions.add(new Contribution(label, points));
        }
    }

    private static boolean equippedFor(UnitInput unit, IncidentInput input) {
        if (isMedical(input) && !unit.equipment().contains("MEDICAL")) {
            return false;
        }
        if (!isFlood(input)) {
            return true;
        }
        if (input.depthCm() >= 55) {
            return unit.equipment().contains("BOAT");
        }
        return unit.equipment().contains("BOAT") || unit.equipment().contains("HIGH_CLEARANCE");
    }

    private static double specialistPenalty(UnitInput unit, IncidentInput input) {
        double penalty = 0;
        if (unit.equipment().contains("BOAT") && (!isFlood(input) || input.depthCm() < 55)) {
            penalty += 1.25;
        }
        if (unit.equipment().contains("MEDICAL") && !isMedical(input)) {
            penalty += 0.85;
        }
        return penalty;
    }

    private static boolean isMedical(IncidentInput input) {
        return input.medical() || "MEDICAL".equalsIgnoreCase(input.hazard());
    }

    private static boolean isFlood(IncidentInput input) {
        return "FLOOD".equalsIgnoreCase(input.hazard());
    }

    static double round(double value, int places) {
        double factor = Math.pow(10, places);
        return Math.round(value * factor) / factor;
    }

    private enum Band {
        LOW, MEDIUM, HIGH, CRITICAL;

        static Band parse(String value) {
            return value == null || value.isBlank() ? LOW : valueOf(value.strip().toUpperCase(Locale.ROOT));
        }
    }

    public record Graph(List<Node> nodes, List<Road> roads, List<FloodZone> floodZones) {}
    public record Node(String id, String label, double lat, double lng) {}
    public record Road(String id, String from, String to, double distanceKm, int speedKph) {}
    public record FloodZone(String id, String label, List<Location> polygon) {}
    public record Location(double lat, double lng) {}
    public record Contribution(String label, int points) {}
    public record Triage(String severity, int score, List<Contribution> contributions) {}

    public record IncidentInput(int people, boolean medical, boolean vulnerable, int depthCm,
                                boolean immediateDanger, String hazard, int waitingMinutes) {
        public IncidentInput {
            if (people < 1 || depthCm < 0 || waitingMinutes < 0) {
                throw new IllegalArgumentException("People must be positive. Depth and waiting time must be nonnegative.");
            }
        }
    }

    public record Route(boolean reachable, List<String> nodeIds, List<String> roadIds, List<Location> path,
                        double distanceKm, double travelMinutes) {}

    public record UnitInput(String id, String nodeId, int capacity, Set<String> equipment, boolean available) {
        public UnitInput {
            Objects.requireNonNull(id, "Unit id");
            Objects.requireNonNull(nodeId, "Unit node id");
            if (capacity < 1) {
                throw new IllegalArgumentException("Unit capacity must be positive.");
            }
            equipment = Set.copyOf(equipment);
        }
    }

    public record Candidate(String unitId, Route route, int spareCapacity, double rank) {}
    public record Match(List<Candidate> candidates, boolean multiUnitRequired, String reason) {}
    public record ScenarioInput(long seed, int incidents, int units, int floodIntensity, int networkDisruption) {}
    public record SimulationSummary(int horizonMinutes, int offlineReports, List<String> blockedRoadIds,
                                    List<String> activeFloodZoneIds) {}
    public record Metrics(Double averageResponseMinutes, double criticalServedPercent, double utilizationPercent,
                          int unservedIncidents, int servedIncidents, int criticalServed, int criticalIncidents) {}

    public record SimIncident(String id, String nodeId, String severity, int people, int createdMinute,
                              int availableMinute, boolean offline, String hazard, boolean medical,
                              boolean vulnerable, int depthCm, boolean immediateDanger) {
        IncidentInput input(int minute) {
            return new IncidentInput(people, medical, vulnerable, depthCm, immediateDanger, hazard,
                    Math.max(0, minute - createdMinute));
        }
    }

    public record SimUnit(String id, String nodeId, int capacity, List<String> equipment) {}
    public record Dispatch(String incidentId, String unitId, String fromNodeId, String toNodeId,
                           int dispatchMinute, int arrivalMinute, int availableAgainMinute, Route route) {}

    public record Simulation(ScenarioInput scenario, SimulationSummary summary, Metrics baseline, Metrics hydroGrid,
                             List<SimIncident> incidents, List<SimUnit> units, List<Dispatch> baselineDispatches,
                             List<Dispatch> hydroGridDispatches) {}
}
