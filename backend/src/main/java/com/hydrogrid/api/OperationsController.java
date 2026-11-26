package com.hydrogrid.api;

import com.hydrogrid.api.Models.*;
import com.hydrogrid.engine.HydroEngine.Match;
import com.hydrogrid.engine.HydroEngine.Route;
import com.hydrogrid.engine.HydroEngine.ScenarioInput;
import com.hydrogrid.engine.HydroEngine.Simulation;
import com.hydrogrid.store.IncidentStore;
import com.hydrogrid.store.SessionStore;
import com.hydrogrid.store.ShelterStore;
import com.hydrogrid.store.SpatialGraph;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
class OperationsController {
    private final IncidentStore incidents;
    private final SessionStore sessions;
    private final ShelterStore shelters;
    private final SpatialGraph graph;

    OperationsController(IncidentStore incidents, SessionStore sessions, ShelterStore shelters, SpatialGraph graph) {
        this.incidents = incidents;
        this.sessions = sessions;
        this.shelters = shelters;
        this.graph = graph;
    }

    @GetMapping("/incidents")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER','SHELTER')")
    List<Incident> incidents(@AuthenticationPrincipal Jwt jwt) {
        return incidents.list(session(jwt), "RESPONDER".equals(jwt.getClaimAsString("role")));
    }

    @PostMapping("/incidents")
    @PreAuthorize("hasAnyRole('CITIZEN','COORDINATOR')")
    Incident report(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody IncidentReport report) {
        return incidents.submit(session(jwt), report);
    }

    @GetMapping("/units")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER')")
    List<Unit> units(@AuthenticationPrincipal Jwt jwt) {
        return incidents.units(session(jwt));
    }

    @GetMapping("/incidents/{id}/recommendations")
    @PreAuthorize("hasRole('COORDINATOR')")
    Match recommendations(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return incidents.recommendations(session(jwt), id);
    }

    @PostMapping("/incidents/{id}/dispatch")
    @PreAuthorize("hasRole('COORDINATOR')")
    Incident dispatch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                      @RequestBody(required = false) DispatchRequest dispatch) {
        return incidents.dispatch(session(jwt), id, dispatch == null ? null : dispatch.unitId());
    }

    @PostMapping("/incidents/{id}/status")
    @PreAuthorize("hasAnyRole('RESPONDER','COORDINATOR')")
    Incident advance(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody MissionUpdate update) {
        if (update.status() == Status.REPORTED || update.status() == Status.ASSIGNED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A mission update requires EN_ROUTE, ON_SCENE or RESOLVED");
        }
        return incidents.advance(session(jwt), id, update);
    }

    @PostMapping("/incidents/{id}/triage")
    @PreAuthorize("hasRole('COORDINATOR')")
    Incident triage(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody TriageOverride override) {
        return incidents.override(session(jwt), id, override);
    }

    @GetMapping("/incidents/{id}/timeline")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER')")
    List<AuditEvent> timeline(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return incidents.timeline(session(jwt), id);
    }

    @GetMapping("/audit")
    @PreAuthorize("hasRole('COORDINATOR')")
    List<AuditEvent> audit(@AuthenticationPrincipal Jwt jwt) {
        return sessions.audit(session(jwt), null);
    }

    @GetMapping("/clusters")
    @PreAuthorize("hasRole('COORDINATOR')")
    List<Cluster> clusters(@AuthenticationPrincipal Jwt jwt) {
        return incidents.clusters(session(jwt));
    }

    @PostMapping("/clusters")
    @PreAuthorize("hasRole('COORDINATOR')")
    ClusterGroup group(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ClusterConfirmation confirmation) {
        return incidents.group(session(jwt), confirmation);
    }

    @GetMapping("/shelters")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER','SHELTER')")
    List<Shelter> shelters(@AuthenticationPrincipal Jwt jwt) {
        return shelters.list(session(jwt));
    }

    @GetMapping("/shelters/recommendations")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER','SHELTER')")
    List<ShelterRecommendation> shelterRecommendations(@AuthenticationPrincipal Jwt jwt, @RequestParam UUID incidentId) {
        return shelters.recommend(session(jwt), incidentId);
    }

    @GetMapping("/shelters/{id}/reservations")
    @PreAuthorize("hasAnyRole('COORDINATOR','SHELTER')")
    List<Reservation> reservations(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return shelters.reservations(session(jwt), id);
    }

    @PostMapping("/shelters/{id}/reservations")
    @PreAuthorize("hasAnyRole('COORDINATOR','SHELTER')")
    Reservation reserve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                        @Valid @RequestBody ReservationRequest reservation) {
        return shelters.reserve(session(jwt), id, reservation);
    }

    @PostMapping("/shelters/{id}/reservations/{reservationId}/admit")
    @PreAuthorize("hasAnyRole('COORDINATOR','SHELTER')")
    Reservation admit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID reservationId) {
        return shelters.admit(session(jwt), id, reservationId);
    }

    @GetMapping("/graph")
    Graph graph(@AuthenticationPrincipal Jwt jwt) {
        return graph.snapshot(sessions.intensity(jwt == null ? null : session(jwt)));
    }

    @PostMapping("/hazards")
    @PreAuthorize("hasRole('COORDINATOR')")
    Graph hazard(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody HazardUpdate update) {
        return sessions.setIntensity(session(jwt), update.intensity());
    }

    @GetMapping("/routes")
    @PreAuthorize("hasAnyRole('COORDINATOR','RESPONDER','SHELTER')")
    Route route(@AuthenticationPrincipal Jwt jwt, @RequestParam String from, @RequestParam String to) {
        if (graph.node(from) == null || graph.node(to) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Route endpoints must be valid demo graph nodes");
        }
        return graph.engine().route(from, to, graph.snapshot(sessions.intensity(session(jwt))).blockedRoadIds());
    }

    @PostMapping("/simulation")
    @PreAuthorize("hasRole('COORDINATOR')")
    Simulation simulate(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SimulationRequest request) {
        session(jwt);
        return graph.engine().simulate(new ScenarioInput(
                request.seed(), request.incidents(), request.units(), request.floodIntensity(), request.networkDisruption()));
    }

    static UUID session(Jwt jwt) {
        if (!Boolean.TRUE.equals(jwt.getClaimAsBoolean("demoOwned")) || jwt.getClaimAsString("session") == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "An owned exercise workspace is required");
        }
        return UUID.fromString(jwt.getClaimAsString("session"));
    }
}
