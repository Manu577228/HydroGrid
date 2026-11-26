package com.hydrogrid.engine;

import com.hydrogrid.engine.HydroEngine.Dispatch;
import com.hydrogrid.engine.HydroEngine.Metrics;
import com.hydrogrid.engine.HydroEngine.ScenarioInput;
import com.hydrogrid.engine.HydroEngine.SimIncident;
import com.hydrogrid.engine.HydroEngine.Simulation;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DispatchSimulationTest {
    private final HydroEngine engine = new HydroEngine();

    @Test
    void seededIncidentFleetAndBothReplaysAreReproducible() {
        var input = new ScenarioInput(1337, 100, 15, 40, 30);
        Simulation result = engine.simulate(input);

        assertEquals(result, engine.simulate(input));
        assertNotEquals(result.incidents(), engine.simulate(new ScenarioInput(42, 100, 15, 40, 30)).incidents());
        assertNotEquals(result.baselineDispatches(), result.hydroGridDispatches());
        assertEquals(31, result.summary().offlineReports());
        assertEquals(13, result.baseline().criticalServed());
        assertEquals(14, result.hydroGrid().criticalServed());
        assertTrue(result.hydroGrid().averageResponseMinutes() > result.baseline().averageResponseMinutes());
    }

    @Test
    void outagesDelayIncidentVisibilityWithoutChangingGeneratedIncidents() {
        var online = engine.simulate(new ScenarioInput(17, 20, 5, 0, 0));
        var offline = engine.simulate(new ScenarioInput(17, 20, 5, 0, 100));
        var onlineById = online.incidents().stream().collect(Collectors.toMap(SimIncident::id, Function.identity()));

        assertEquals(0, online.summary().offlineReports());
        assertEquals(20, offline.summary().offlineReports());
        assertEquals(online.units(), offline.units());
        for (SimIncident incident : offline.incidents()) {
            SimIncident original = onlineById.get(incident.id());
            assertEquals(original.nodeId(), incident.nodeId());
            assertEquals(original.createdMinute(), incident.createdMinute());
            assertEquals(original.severity(), incident.severity());
            assertTrue(incident.availableMinute() > original.availableMinute());
        }
    }

    @Test
    void dispatchesRespectOutagesClosuresBusyUnitsAndSharedTiming() {
        var result = engine.simulate(new ScenarioInput(73, 140, 12, 80, 60));
        assertReplay(result, result.baseline(), result.baselineDispatches());
        assertReplay(result, result.hydroGrid(), result.hydroGridDispatches());
    }

    private static void assertReplay(Simulation result, Metrics totals, List<Dispatch> dispatches) {
        var incidentById = result.incidents().stream().collect(Collectors.toMap(SimIncident::id, Function.identity()));
        var assigned = new HashSet<String>();
        var unitFree = new HashMap<String, Integer>();
        var unitPosition = result.units().stream().collect(Collectors.toMap(HydroEngine.SimUnit::id, HydroEngine.SimUnit::nodeId));
        int horizon = result.summary().horizonMinutes();
        int served = 0;
        int criticalServed = 0;
        int responseMinutes = 0;
        int busyMinutes = 0;
        for (Dispatch dispatch : dispatches) {
            assertTrue(assigned.add(dispatch.incidentId()));
            assertTrue(dispatch.dispatchMinute() >= unitFree.getOrDefault(dispatch.unitId(), 0));
            assertEquals(unitPosition.get(dispatch.unitId()), dispatch.fromNodeId());
            assertEquals(dispatch.fromNodeId(), dispatch.route().nodeIds().getFirst());
            assertEquals(dispatch.toNodeId(), dispatch.route().nodeIds().getLast());
            assertTrue(dispatch.route().roadIds().stream().noneMatch(result.summary().blockedRoadIds()::contains));
            SimIncident incident = incidentById.get(dispatch.incidentId());
            assertTrue(dispatch.dispatchMinute() >= incident.availableMinute());
            assertEquals(incident.nodeId(), dispatch.toNodeId());
            unitPosition.put(dispatch.unitId(), dispatch.toNodeId());
            unitFree.put(dispatch.unitId(), dispatch.availableAgainMinute());
            busyMinutes += Math.min(dispatch.availableAgainMinute(), horizon) - dispatch.dispatchMinute();
            if (dispatch.arrivalMinute() <= horizon) {
                served++;
                responseMinutes += dispatch.arrivalMinute() - incident.createdMinute();
                if ("CRITICAL".equals(incident.severity())) {
                    criticalServed++;
                }
            }
        }
        assertEquals(served, totals.servedIncidents());
        assertEquals(criticalServed, totals.criticalServed());
        assertEquals(result.incidents().size() - served, totals.unservedIncidents());
        assertEquals(HydroEngine.round((double) responseMinutes / served, 2), totals.averageResponseMinutes());
        assertEquals(HydroEngine.round(100.0 * busyMinutes / (horizon * result.units().size()), 2), totals.utilizationPercent());
    }
}
