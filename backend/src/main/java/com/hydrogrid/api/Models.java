package com.hydrogrid.api;

import com.hydrogrid.engine.HydroEngine.Contribution;
import com.hydrogrid.engine.HydroEngine.FloodZone;
import com.hydrogrid.engine.HydroEngine.Node;
import com.hydrogrid.engine.HydroEngine.Road;
import com.hydrogrid.engine.HydroEngine.Route;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class Models {
    private Models() {}

    public enum Role { COORDINATOR, RESPONDER, SHELTER, CITIZEN }
    public enum Hazard { FLOOD, MEDICAL, LANDSLIDE, INFRASTRUCTURE, OTHER }
    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL }

    public enum Status {
        REPORTED, ASSIGNED, EN_ROUTE, ON_SCENE, RESOLVED;

        public boolean allows(Status target) {
            return switch (this) {
                case ASSIGNED -> target == EN_ROUTE;
                case EN_ROUTE -> target == ON_SCENE;
                case ON_SCENE -> target == RESOLVED;
                default -> false;
            };
        }
    }

    public record DemoLogin(@NotNull Role role) {}
    public record DemoToken(String token, Role role) {}
    public record IncidentReport(
            @NotNull UUID clientId, @NotBlank @Size(max = 160) String summary,
            @NotNull Hazard hazard, @Min(1) @Max(200) int people,
            boolean medical, boolean vulnerable, @Min(0) @Max(500) int depthCm,
            boolean immediateDanger,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double lng,
            Severity reportedSeverity
    ) {}
    public record Incident(
            UUID id, UUID clientId, String summary, Hazard hazard, int people,
            boolean medical, boolean vulnerable, int depthCm, boolean immediateDanger,
            double lat, double lng, String nodeId, Status status, String severity, int score,
            List<Contribution> reasons, Instant createdAt, UUID assignedUnitId, UUID groupId
    ) {}
    public record Unit(UUID id, String name, String nodeId, double lat, double lng,
                       int capacity, Set<String> equipment, String status) {}
    public record DispatchRequest(UUID unitId) {}
    public record MissionUpdate(@NotNull UUID clientId, @NotNull Status status) {}
    public record TriageOverride(@NotNull Severity severity, @NotBlank @Size(max = 240) String reason) {}
    public record AuditEvent(UUID id, UUID incidentId, String type, String detail, Instant createdAt) {}
    public record Cluster(List<UUID> incidentIds, double distanceMeters) {}
    public record ClusterConfirmation(@NotNull @Size(min = 2, max = 20) List<@NotNull UUID> incidentIds) {}
    public record ClusterGroup(UUID groupId) {}
    public record Shelter(UUID id, String name, String type, double lat, double lng, int capacity,
                          int reserved, int admitted, int available) {}
    public record ShelterRecommendation(Shelter shelter, Route route) {}
    public record ReservationRequest(@NotNull UUID clientId, UUID incidentId, @Min(1) @Max(200) int people) {}
    public record Reservation(UUID id, UUID shelterId, UUID incidentId, int people, String status) {}
    public record Graph(List<Node> nodes, List<Road> roads, List<FloodZone> hazards,
                        List<FloodZone> floodZones, Set<String> blockedRoadIds, int intensity) {}
    public record HazardUpdate(@NotNull @Min(0) @Max(100) Integer intensity) {}
    public record SimulationRequest(
            @NotNull Long seed, @Min(1) @Max(250) int incidents, @Min(1) @Max(40) int units,
            @Min(0) @Max(100) int floodIntensity, @Min(0) @Max(100) int networkDisruption
    ) {}
    public record Update(String type, UUID entityId) {}
}
