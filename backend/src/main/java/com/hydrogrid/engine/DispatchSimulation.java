package com.hydrogrid.engine;

import com.hydrogrid.engine.HydroEngine.Candidate;
import com.hydrogrid.engine.HydroEngine.Dispatch;
import com.hydrogrid.engine.HydroEngine.FloodZone;
import com.hydrogrid.engine.HydroEngine.IncidentInput;
import com.hydrogrid.engine.HydroEngine.Metrics;
import com.hydrogrid.engine.HydroEngine.Node;
import com.hydrogrid.engine.HydroEngine.Route;
import com.hydrogrid.engine.HydroEngine.ScenarioInput;
import com.hydrogrid.engine.HydroEngine.SimIncident;
import com.hydrogrid.engine.HydroEngine.SimUnit;
import com.hydrogrid.engine.HydroEngine.Simulation;
import com.hydrogrid.engine.HydroEngine.SimulationSummary;
import com.hydrogrid.engine.HydroEngine.UnitInput;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.SplittableRandom;

final class DispatchSimulation {
    private static final int HORIZON_MINUTES = 120;
    private static final int LAST_INCIDENT_MINUTE = 50;
    private static final Comparator<SimIncident> FIFO = Comparator.comparingInt(SimIncident::availableMinute)
            .thenComparingInt(SimIncident::createdMinute).thenComparing(SimIncident::id);
    private static final List<List<String>> EQUIPMENT = List.of(
            List.of("BOAT", "MEDICAL"), List.of("BOAT"), List.of("HIGH_CLEARANCE"),
            List.of("HIGH_CLEARANCE", "MEDICAL"), List.of("MEDICAL"));

    private final HydroEngine engine;

    DispatchSimulation(HydroEngine engine) {
        this.engine = engine;
    }

    Simulation run(ScenarioInput scenario) {
        validate(scenario);
        SplittableRandom random = new SplittableRandom(scenario.seed());
        List<Node> nodes = engine.graph().nodes();
        List<SimIncident> incidents = incidents(scenario, nodes, random.split());
        List<SimUnit> units = units(scenario.units(), nodes, random.split());
        List<FloodZone> floodZones = engine.activeFloodZones(scenario.floodIntensity());
        Set<String> blockedRoadIds = engine.blockedRoads(floodZones);
        Map<String, Map<String, Route>> routes = routes(nodes, blockedRoadIds);
        var summary = new SimulationSummary(HORIZON_MINUTES,
                (int) incidents.stream().filter(SimIncident::offline).count(), blockedRoadIds.stream().sorted().toList(),
                floodZones.stream().map(FloodZone::id).toList());
        Run baseline = replay(incidents, units, routes, false);
        Run hydroGrid = replay(incidents, units, routes, true);
        return new Simulation(scenario, summary, baseline.metrics(), hydroGrid.metrics(), incidents, units,
                baseline.dispatches(), hydroGrid.dispatches());
    }

    private List<SimIncident> incidents(ScenarioInput scenario, List<Node> nodes, SplittableRandom random) {
        var items = new ArrayList<SimIncident>();
        for (int index = 1; index <= scenario.incidents(); index++) {
            String id = String.format(Locale.ROOT, "SIM-%03d", index);
            String nodeId = nodes.get(random.nextInt(nodes.size())).id();
            int hazardRoll = random.nextInt(100);
            String hazard = hazard(hazardRoll);
            int people = random.nextInt(100) < 76 ? random.nextInt(1, 7) : random.nextInt(7, 15);
            boolean medical = random.nextInt(100) < 17 || "MEDICAL".equals(hazard);
            boolean vulnerable = random.nextInt(100) < 24;
            int depth = random.nextInt(10, 71) + scenario.floodIntensity() / 2;
            int depthCm = "FLOOD".equals(hazard) ? depth : 0;
            boolean immediateDanger = random.nextInt(100) < 13;
            int created = random.nextInt(LAST_INCIDENT_MINUTE + 1);
            boolean offline = random.nextInt(100) < scenario.networkDisruption();
            int delay = random.nextInt(4, 21);
            var input = new IncidentInput(people, medical, vulnerable, depthCm, immediateDanger, hazard, 0);
            items.add(new SimIncident(id, nodeId, engine.triage(input).severity(), people, created,
                    created + (offline ? delay : 0), offline, hazard, medical, vulnerable, depthCm, immediateDanger));
        }
        return items.stream().sorted(FIFO).toList();
    }

    private static String hazard(int roll) {
        if (roll < 70) {
            return "FLOOD";
        }
        if (roll < 83) {
            return "RESCUE";
        }
        if (roll < 95) {
            return "MEDICAL";
        }
        return "EVACUATION";
    }

    private static List<SimUnit> units(int count, List<Node> nodes, SplittableRandom random) {
        var units = new ArrayList<SimUnit>();
        for (int index = 0; index < count; index++) {
            String id = String.format(Locale.ROOT, "SIM-U%02d", index + 1);
            String nodeId = nodes.get(random.nextInt(nodes.size())).id();
            int capacity = random.nextInt(4, 13);
            List<String> equipment = EQUIPMENT.get(index % EQUIPMENT.size());
            units.add(new SimUnit(id, nodeId, capacity, equipment));
        }
        return List.copyOf(units);
    }

    private Map<String, Map<String, Route>> routes(List<Node> nodes, Set<String> blockedRoadIds) {
        var routes = new HashMap<String, Map<String, Route>>();
        for (Node from : nodes) {
            var fromRoutes = new HashMap<String, Route>();
            for (Node to : nodes) {
                fromRoutes.put(to.id(), engine.route(from.id(), to.id(), blockedRoadIds));
            }
            routes.put(from.id(), fromRoutes);
        }
        return routes;
    }

    private Run replay(List<SimIncident> incidents, List<SimUnit> units, Map<String, Map<String, Route>> routes,
                       boolean intelligent) {
        var fleet = new LinkedHashMap<String, UnitState>();
        for (SimUnit unit : units) {
            fleet.put(unit.id(), new UnitState(unit));
        }
        var pending = new ArrayList<SimIncident>();
        var dispatches = new ArrayList<Dispatch>();
        var metrics = new MetricTotals();
        int nextIncident = 0;

        for (int minute = 0; minute < HORIZON_MINUTES; minute++) {
            while (nextIncident < incidents.size() && incidents.get(nextIncident).availableMinute() <= minute) {
                pending.add(incidents.get(nextIncident++));
            }
            if (pending.isEmpty()) {
                continue;
            }
            List<UnitInput> available = availableUnits(fleet, minute);
            if (available.isEmpty()) {
                continue;
            }
            if (intelligent) {
                sortByPriority(pending, minute);
            }
            var iterator = pending.iterator();
            while (iterator.hasNext() && !available.isEmpty()) {
                SimIncident incident = iterator.next();
                List<Candidate> candidates = engine.match(incident.nodeId(), incident.input(minute), available,
                        (from, to) -> routes.get(from).get(to), intelligent).candidates();
                if (candidates.isEmpty()) {
                    continue;
                }
                Candidate selected = candidates.getFirst();
                UnitState state = fleet.get(selected.unitId());
                Dispatch dispatch = state.assign(incident, selected.route(), minute);
                dispatches.add(dispatch);
                metrics.add(incident, dispatch);
                available.removeIf(unit -> unit.id().equals(selected.unitId()));
                iterator.remove();
            }
        }
        return new Run(metrics.finish(incidents, units.size()), List.copyOf(dispatches));
    }

    private static List<UnitInput> availableUnits(Map<String, UnitState> fleet, int minute) {
        var available = new ArrayList<UnitInput>();
        for (UnitState state : fleet.values()) {
            if (state.availableMinute <= minute) {
                available.add(state.input());
            }
        }
        return available;
    }

    private void sortByPriority(List<SimIncident> pending, int minute) {
        var scoreByIncident = new HashMap<String, Integer>();
        for (SimIncident incident : pending) {
            scoreByIncident.put(incident.id(), engine.triage(incident.input(minute)).score());
        }
        pending.sort(Comparator.<SimIncident>comparingInt(incident -> scoreByIncident.get(incident.id()))
                .reversed().thenComparing(FIFO));
    }

    private static void validate(ScenarioInput scenario) {
        if (scenario.incidents() < 1 || scenario.incidents() > 250 || scenario.units() < 1 || scenario.units() > 40) {
            throw new IllegalArgumentException("Use 1–250 incidents and 1–40 units.");
        }
        if (scenario.floodIntensity() < 0 || scenario.floodIntensity() > 100
                || scenario.networkDisruption() < 0 || scenario.networkDisruption() > 100) {
            throw new IllegalArgumentException("Flood intensity and network disruption must be between 0 and 100.");
        }
    }

    private static final class UnitState {
        private final String id;
        private final int capacity;
        private final Set<String> equipment;
        private String nodeId;
        private int availableMinute;

        private UnitState(SimUnit unit) {
            id = unit.id();
            capacity = unit.capacity();
            equipment = Set.copyOf(unit.equipment());
            nodeId = unit.nodeId();
        }

        private UnitInput input() {
            return new UnitInput(id, nodeId, capacity, equipment, true);
        }

        private Dispatch assign(SimIncident incident, Route route, int minute) {
            int arrival = minute + (int) Math.ceil(route.travelMinutes());
            int service = 8 + (incident.people() + 1) / 2 + (incident.medical() ? 6 : 0);
            availableMinute = arrival + service;
            var dispatch = new Dispatch(incident.id(), id, nodeId, incident.nodeId(), minute, arrival, availableMinute, route);
            nodeId = incident.nodeId();
            return dispatch;
        }
    }

    private static final class MetricTotals {
        private int served;
        private int criticalServed;
        private int totalResponseMinutes;
        private int busyMinutes;

        private void add(SimIncident incident, Dispatch dispatch) {
            busyMinutes += Math.min(dispatch.availableAgainMinute(), HORIZON_MINUTES) - dispatch.dispatchMinute();
            if (dispatch.arrivalMinute() <= HORIZON_MINUTES) {
                served++;
                totalResponseMinutes += dispatch.arrivalMinute() - incident.createdMinute();
                if ("CRITICAL".equals(incident.severity())) {
                    criticalServed++;
                }
            }
        }

        private Metrics finish(List<SimIncident> incidents, int units) {
            int critical = (int) incidents.stream().filter(incident -> "CRITICAL".equals(incident.severity())).count();
            Double mean = served == 0 ? null : HydroEngine.round((double) totalResponseMinutes / served, 2);
            double criticalPercent = critical == 0 ? 0 : HydroEngine.round(100.0 * criticalServed / critical, 2);
            double utilization = HydroEngine.round(100.0 * busyMinutes / (units * HORIZON_MINUTES), 2);
            return new Metrics(mean, criticalPercent, utilization, incidents.size() - served, served, criticalServed, critical);
        }
    }

    private record Run(Metrics metrics, List<Dispatch> dispatches) {}
}
