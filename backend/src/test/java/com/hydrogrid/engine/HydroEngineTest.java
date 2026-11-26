package com.hydrogrid.engine;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HydroEngineTest {
    private final HydroEngine engine = new HydroEngine();

    @Test
    void canalOverflowClosesTheDirectRoadAndLeavesADetour() {
        var dry = engine.route("N06", "N07", Set.of());
        Set<String> closures = engine.blockedRoads(engine.activeFloodZones(40));
        var wet = engine.route("N06", "N07", closures);

        assertEquals(Set.of("R05"), closures);
        assertEquals(List.of("R05"), dry.roadIds());
        assertEquals(List.of("N06", "N11", "N07"), wet.nodeIds());
        assertEquals(List.of("R26", "R19"), wet.roadIds());
        assertTrue(wet.reachable());
        assertTrue(wet.distanceKm() > dry.distanceKm());
        assertTrue(wet.travelMinutes() > dry.travelMinutes());
    }

    @Test
    void largerFloodFootprintsCanIsolateAnIncident() {
        Set<String> moderate = engine.blockedRoads(engine.activeFloodZones(45));
        Set<String> severe = engine.blockedRoads(engine.activeFloodZones(75));

        assertTrue(severe.containsAll(moderate));
        assertTrue(severe.size() > moderate.size());
        assertFalse(engine.route("N06", "N11", moderate).reachable());
        assertTrue(engine.route("N11", "N11", moderate).reachable());
    }

    @Test
    void triageExplainsPointsAndCoordinatorOverrideTakesPrecedence() {
        var input = new HydroEngine.IncidentInput(4, true, true, 0, false, "RESCUE", 10);
        var triage = engine.triage("CRITICAL", input);

        assertEquals("CRITICAL", triage.severity());
        assertEquals(358, triage.score());
        assertEquals(triage.score(), triage.contributions().stream().mapToInt(HydroEngine.Contribution::points).sum());
        assertEquals("HIGH", engine.triage("LOW", input).severity());
        assertEquals("MEDIUM", engine.triageOverride("MEDIUM", input).severity());
        assertEquals(158, engine.triageOverride("MEDIUM", input).score());
    }

    @Test
    void waitingAndHeadcountKeepAnIncidentWithinItsSeverityBand() {
        var input = new HydroEngine.IncidentInput(100, true, true, 500, false, "FLOOD", 1_000);
        assertEquals(298, engine.triageOverride("HIGH", input).score());
        assertEquals(398, engine.triage(input).score());
    }

    @Test
    void dispatchFiltersUnavailableUnderEquippedAndUnreachableUnits() {
        var incident = new HydroEngine.IncidentInput(4, true, true, 70, false, "FLOOD", 0);
        var units = List.of(
                new HydroEngine.UnitInput("busy", "N07", 4, Set.of("BOAT", "MEDICAL"), false),
                new HydroEngine.UnitInput("land", "N07", 4, Set.of("HIGH_CLEARANCE", "MEDICAL"), true),
                new HydroEngine.UnitInput("without_medic", "N07", 4, Set.of("BOAT"), true),
                new HydroEngine.UnitInput("isolated", "N11", 4, Set.of("BOAT", "MEDICAL"), true),
                new HydroEngine.UnitInput("closest", "N07", 12, Set.of("BOAT", "MEDICAL"), true),
                new HydroEngine.UnitInput("best_fit", "N03", 4, Set.of("BOAT", "MEDICAL"), true));
        var result = engine.match("N07", incident, units, engine.blockedRoads(engine.activeFloodZones(45)));

        assertEquals(List.of("best_fit", "closest"), result.candidates().stream()
                .map(HydroEngine.Candidate::unitId).toList());
        assertEquals(0, result.candidates().getFirst().spareCapacity());
    }

    @Test
    void singleUnitCapacityShortfallFlagsMultipleUnitsOrTrips() {
        var incident = new HydroEngine.IncidentInput(12, false, false, 80, false, "FLOOD", 0);
        var units = List.of(new HydroEngine.UnitInput("boat", "N01", 6, Set.of("BOAT"), true));
        var result = engine.match("N02", incident, units, Set.of());

        assertTrue(result.candidates().isEmpty());
        assertTrue(result.multiUnitRequired());
    }
}
