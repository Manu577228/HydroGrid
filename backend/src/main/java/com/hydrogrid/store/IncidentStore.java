package com.hydrogrid.store;

import com.hydrogrid.api.Models.*;
import com.hydrogrid.config.LiveUpdates;
import com.hydrogrid.engine.HydroEngine;
import com.hydrogrid.engine.HydroEngine.IncidentInput;
import com.hydrogrid.engine.HydroEngine.Match;
import com.hydrogrid.engine.HydroEngine.UnitInput;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static java.util.UUID.randomUUID;

@Service
public class IncidentStore {
    private static final Set<String> EXERCISE_REVIEW_REASONS =
            Set.of("Field verification", "Conditions changed", "Report correction");
    private static final String INCIDENT_SELECT = """
            SELECT i.*, ST_Y(i.position) lat, ST_X(i.position) lng
            FROM incidents i WHERE session_id = :session
            """;
    private static final String UNIT_SELECT = """
            SELECT u.*, ST_Y(n.position) lat, ST_X(n.position) lng
            FROM rescue_units u JOIN graph_nodes n ON n.id = u.node_id
            WHERE u.session_id = :session
            """;
    private final JdbcClient db;
    private final SpatialGraph graph;
    private final SessionStore sessions;
    private final LiveUpdates updates;
    private final boolean allowCustomReports;

    public IncidentStore(JdbcClient db, SpatialGraph graph, SessionStore sessions, LiveUpdates updates,
                         @Value("${hydrogrid.allow-custom-reports}") boolean allowCustomReports) {
        this.db = db;
        this.graph = graph;
        this.sessions = sessions;
        this.updates = updates;
        this.allowCustomReports = allowCustomReports;
    }

    public boolean synthetic() {
        return !allowCustomReports;
    }

    public List<Incident> list(UUID session, boolean assignedOnly) {
        String filter = assignedOnly ? " AND assigned_unit_id IS NOT NULL" : "";
        return db.sql(INCIDENT_SELECT + filter).param("session", session)
                .query(IncidentStore::readIncident).list().stream().map(this::view)
                .sorted(Comparator.comparingInt(Incident::score).reversed()
                        .thenComparing(Incident::createdAt).thenComparing(Incident::id))
                .toList();
    }

    public Incident detail(UUID session, UUID id) {
        return view(get(session, id, false));
    }

    public List<Unit> units(UUID session) {
        return db.sql(UNIT_SELECT + " ORDER BY name").param("session", session)
                .query(IncidentStore::readUnit).list();
    }

    @Transactional
    public Incident submit(UUID session, IncidentReport report) {
        var node = graph.nearest(report.lat(), report.lng());
        var summary = allowCustomReports ? report.summary().strip() : syntheticSummary(report.hazard());
        var reported = report.reportedSeverity() == null ? Severity.LOW : report.reportedSeverity();
        double lat = allowCustomReports ? report.lat() : node.position.getY();
        double lng = allowCustomReports ? report.lng() : node.position.getX();
        UUID id = randomUUID();
        int inserted = db.sql("""
                INSERT INTO incidents(id, session_id, client_id, summary, hazard, people, medical, vulnerable,
                    depth_cm, immediate_danger, position, node_id, reported_severity, status, created_at)
                VALUES (:id, :session, :client, :summary, :hazard, :people, :medical, :vulnerable,
                    :depth, :danger, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :node, :severity, 'REPORTED', :created)
                ON CONFLICT (session_id, client_id) DO NOTHING
                """).param("id", id).param("session", session).param("client", report.clientId())
                .param("summary", summary).param("hazard", report.hazard().name()).param("people", report.people())
                .param("medical", report.medical()).param("vulnerable", report.vulnerable())
                .param("depth", report.depthCm()).param("danger", report.immediateDanger())
                .param("lng", lng).param("lat", lat).param("node", node.id)
                .param("severity", reported.name()).param("created", Timestamp.from(Instant.now())).update();
        StoredIncident saved = db.sql(INCIDENT_SELECT + " AND client_id = :client")
                .param("session", session).param("client", report.clientId()).query(IncidentStore::readIncident).single();
        if (inserted == 0 && !matchesReport(saved, report, summary, reported, lat, lng)) {
            throw conflict("This SOS id already belongs to a different report");
        }
        if (inserted == 1) {
            sessions.record(session, id, "SOS_REPORTED", summary);
            updates.publish(session, "SOS_REPORTED", id);
        }
        return view(saved);
    }

    public Match recommendations(UUID session, UUID incidentId) {
        StoredIncident incident = get(session, incidentId, false);
        if (incident.status() != Status.REPORTED) {
            return new Match(List.of(), false, "This incident already has a rescue assignment");
        }
        return matches(session, incident, sessions.intensity(session));
    }

    @Transactional
    public Incident dispatch(UUID session, UUID incidentId, UUID requestedUnitId) {
        int intensity = sessions.lockHazardSnapshot(session);
        var incident = get(session, incidentId, true);
        if (incident.status() != Status.REPORTED) {
            if (incident.status() != Status.RESOLVED &&
                    (requestedUnitId == null || requestedUnitId.equals(incident.assignedUnitId()))) {
                return view(incident);
            }
            throw conflict("This incident already has a rescue assignment");
        }
        var match = matches(session, incident, intensity);
        var unitIds = match.candidates().stream().map(candidate -> UUID.fromString(candidate.unitId())).toList();
        if (requestedUnitId != null) {
            if (!unitIds.contains(requestedUnitId)) throw conflict(match.candidates().isEmpty()
                    ? match.reason() : "The selected unit is unavailable or incompatible");
            unitIds = List.of(requestedUnitId);
        }
        for (UUID unitId : unitIds) {
            // The conditional update takes a row lock and rechecks availability after any competing assignment commits.
            var name = db.sql("""
                    UPDATE rescue_units SET status = 'BUSY'
                    WHERE session_id = :session AND id = :id AND status = 'AVAILABLE'
                    RETURNING name
                    """).param("session", session).param("id", unitId).query(String.class).optional();
            if (name.isEmpty()) continue;

            db.sql("UPDATE incidents SET assigned_unit_id = :unit, status = 'ASSIGNED' WHERE id = :id")
                    .param("unit", unitId).param("id", incidentId).update();
            sessions.record(session, incidentId, "UNIT_DISPATCHED", name.get() + " assigned");
            updates.publish(session, "UNIT_DISPATCHED", incidentId);
            return view(get(session, incidentId, false));
        }
        throw conflict(match.candidates().isEmpty() ? match.reason() : "Eligible rescue units are now busy");
    }

    @Transactional
    public Incident advance(UUID session, UUID incidentId, MissionUpdate request) {
        var incident = get(session, incidentId, true);
        var match = db.sql("""
                INSERT INTO mission_actions(session_id, client_id, incident_id, status)
                VALUES (:session, :client, :incident, :status) ON CONFLICT DO NOTHING
                """).param("session", session).param("client", request.clientId())
                .param("incident", incidentId).param("status", request.status().name()).update();
        if (match == 0) {
            boolean same = db.sql("""
                    SELECT incident_id = :incident AND status = :status
                    FROM mission_actions WHERE session_id = :session AND client_id = :client
                    """).param("incident", incidentId).param("status", request.status().name())
                    .param("session", session).param("client", request.clientId()).query(Boolean.class).single();
            if (!same) throw conflict("This mission action id already belongs to a different update");
            return view(incident);
        }
        if (incident.status() == request.status()) return view(incident);
        if (!incident.status().allows(request.status())) {
            throw conflict("Invalid mission transition from " + incident.status() + " to " + request.status());
        }
        db.sql("UPDATE incidents SET status = :status WHERE id = :id")
                .param("status", request.status().name()).param("id", incidentId).update();
        if (request.status() == Status.RESOLVED) {
            db.sql("UPDATE rescue_units SET status = 'AVAILABLE', node_id = :node WHERE id = :unit")
                    .param("node", incident.nodeId()).param("unit", incident.assignedUnitId()).update();
        }
        sessions.record(session, incidentId, "MISSION_" + request.status(), transitionLabel(request.status()));
        updates.publish(session, "MISSION_" + request.status(), incidentId);
        return view(get(session, incidentId, false));
    }

    @Transactional
    public Incident override(UUID session, UUID id, TriageOverride override) {
        var incident = get(session, id, true);
        if (incident.status() == Status.RESOLVED) throw conflict("This incident is resolved");
        String requested = override.reason().strip();
        String reason = allowCustomReports || EXERCISE_REVIEW_REASONS.contains(requested)
                ? requested : "Coordinator override";
        db.sql("UPDATE incidents SET override_severity = :severity, override_reason = :reason WHERE id = :id")
                .param("severity", override.severity().name()).param("reason", reason).param("id", id).update();
        sessions.record(session, id, "TRIAGE_OVERRIDDEN", override.severity().name() + " · " + reason);
        updates.publish(session, "TRIAGE_OVERRIDDEN", id);
        return view(get(session, id, false));
    }

    public List<AuditEvent> timeline(UUID session, UUID id) {
        get(session, id, false);
        return sessions.audit(session, id);
    }

    public List<Cluster> clusters(UUID session) {
        return db.sql("""
                SELECT a.id first_id, b.id second_id,
                       ST_Distance(a.position::geography, b.position::geography) distance
                FROM incidents a JOIN incidents b ON a.session_id = b.session_id AND a.id < b.id
                WHERE a.session_id = :session AND a.hazard = b.hazard
                  AND a.group_id IS NULL AND b.group_id IS NULL
                  AND a.status <> 'RESOLVED' AND b.status <> 'RESOLVED'
                  AND a.created_at BETWEEN b.created_at - interval '45 minutes' AND b.created_at + interval '45 minutes'
                  AND ST_DWithin(a.position::geography, b.position::geography, 750)
                ORDER BY distance, first_id, second_id
                """).param("session", session).query((r, n) -> new Cluster(
                List.of(r.getObject("first_id", UUID.class), r.getObject("second_id", UUID.class)),
                Math.round(r.getDouble("distance")))).list();
    }

    @Transactional
    public ClusterGroup group(UUID session, ClusterConfirmation request) {
        Set<UUID> ids = new HashSet<>(request.incidentIds());
        if (ids.size() != request.incidentIds().size()) throw conflict("Choose distinct SOS reports");
        var incidents = db.sql(INCIDENT_SELECT + " AND id IN (:ids) ORDER BY id FOR UPDATE")
                .param("session", session).param("ids", ids).query(IncidentStore::readIncident).list();
        if (incidents.size() != ids.size()) throw missing("One of the reports was not found");
        var linked = new HashSet<UUID>();
        linked.add(incidents.getFirst().id());
        var candidates = clusters(session).stream()
                .filter(pair -> ids.containsAll(pair.incidentIds())).toList();
        int previous;
        do {
            previous = linked.size();
            for (Cluster candidate : candidates) {
                if (candidate.incidentIds().stream().anyMatch(linked::contains)) linked.addAll(candidate.incidentIds());
            }
        } while (linked.size() != previous);
        if (!linked.equals(ids)) throw conflict("Choose related, open reports with no existing group");
        UUID groupId = randomUUID();
        db.sql("UPDATE incidents SET group_id = :group WHERE session_id = :session AND id IN (:ids)")
                .param("group", groupId).param("session", session).param("ids", ids).update();
        for (UUID id : ids) sessions.record(session, id, "GROUP_CONFIRMED", "Related SOS group confirmed");
        updates.publish(session, "GROUP_CONFIRMED", groupId);
        return new ClusterGroup(groupId);
    }

    StoredIncident get(UUID session, UUID id, boolean locked) {
        return db.sql(INCIDENT_SELECT + " AND id = :id" + (locked ? " FOR UPDATE" : ""))
                .param("session", session).param("id", id).query(IncidentStore::readIncident).optional()
                .orElseThrow(() -> missing("Incident was not found"));
    }

    private Match matches(UUID session, StoredIncident incident, int intensity) {
        List<UnitInput> candidates = units(session).stream().map(unit -> new UnitInput(
                unit.id().toString(), unit.nodeId(), unit.capacity(), unit.equipment(),
                unit.status().equals("AVAILABLE"))).toList();
        return graph.engine().match(incident.nodeId(), input(incident), candidates, graph.snapshot(intensity).blockedRoadIds());
    }

    private Incident view(StoredIncident incident) {
        HydroEngine engine = graph.engine();
        IncidentInput input = input(incident);
        var triage = incident.overrideSeverity() == null
                ? engine.triage(incident.reportedSeverity(), input)
                : engine.triageOverride(incident.overrideSeverity(), input);
        return new Incident(incident.id(), incident.clientId(), incident.summary(), incident.hazard(),
                incident.people(), incident.medical(), incident.vulnerable(), incident.depthCm(), incident.immediateDanger(),
                incident.lat(), incident.lng(), incident.nodeId(), incident.status(), triage.severity(), triage.score(),
                triage.contributions(), incident.createdAt(), incident.assignedUnitId(), incident.groupId());
    }

    private static IncidentInput input(StoredIncident incident) {
        int wait = incident.status() == Status.REPORTED
                ? (int) Math.clamp(Duration.between(incident.createdAt(), Instant.now()).toMinutes(), 0, 30)
                : 0;
        return new IncidentInput(incident.people(), incident.medical(), incident.vulnerable(), incident.depthCm(),
                incident.immediateDanger(), incident.hazard().name(), wait);
    }

    private static boolean matchesReport(StoredIncident stored, IncidentReport report, String summary,
                                         Severity reported, double lat, double lng) {
        return stored.summary().equals(summary) && stored.hazard() == report.hazard()
                && stored.people() == report.people() && stored.medical() == report.medical()
                && stored.vulnerable() == report.vulnerable() && stored.depthCm() == report.depthCm()
                && stored.immediateDanger() == report.immediateDanger()
                && Double.compare(stored.lat(), lat) == 0 && Double.compare(stored.lng(), lng) == 0
                && stored.reportedSeverity().equals(reported.name());
    }

    private static StoredIncident readIncident(ResultSet r, int n) throws SQLException {
        return new StoredIncident(
                r.getObject("id", UUID.class), r.getObject("client_id", UUID.class), r.getString("summary"),
                Hazard.valueOf(r.getString("hazard")), r.getInt("people"), r.getBoolean("medical"),
                r.getBoolean("vulnerable"), r.getInt("depth_cm"), r.getBoolean("immediate_danger"),
                r.getDouble("lat"), r.getDouble("lng"), r.getString("node_id"), Status.valueOf(r.getString("status")),
                r.getString("reported_severity"), r.getString("override_severity"), r.getTimestamp("created_at").toInstant(),
                r.getObject("assigned_unit_id", UUID.class), r.getObject("group_id", UUID.class));
    }

    private static Unit readUnit(ResultSet r, int n) throws SQLException {
        return new Unit(r.getObject("id", UUID.class), r.getString("name"), r.getString("node_id"),
                r.getDouble("lat"), r.getDouble("lng"), r.getInt("capacity"),
                Set.of((String[]) r.getArray("equipment").getArray()), r.getString("status"));
    }

    private static String syntheticSummary(Hazard hazard) {
        return switch (hazard) {
            case FLOOD -> "Flood rescue request";
            case MEDICAL -> "Medical aid request";
            case LANDSLIDE -> "Landslide rescue request";
            case INFRASTRUCTURE -> "Infrastructure incident";
            case OTHER -> "General assistance request";
        };
    }

    private static String transitionLabel(Status status) {
        return switch (status) {
            case EN_ROUTE -> "Rescue unit traveling to the incident";
            case ON_SCENE -> "Rescue unit arrived";
            case RESOLVED -> "Mission completed and rescue unit released";
            default -> status.name();
        };
    }

    static ResponseStatusException conflict(String detail) {
        return new ResponseStatusException(HttpStatus.CONFLICT, detail);
    }

    static ResponseStatusException missing(String detail) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, detail);
    }

    record StoredIncident(UUID id, UUID clientId, String summary, Hazard hazard, int people,
                          boolean medical, boolean vulnerable, int depthCm, boolean immediateDanger,
                          double lat, double lng, String nodeId, Status status, String reportedSeverity,
                          String overrideSeverity, Instant createdAt, UUID assignedUnitId, UUID groupId) {}
}
