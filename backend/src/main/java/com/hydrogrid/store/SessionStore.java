package com.hydrogrid.store;

import com.hydrogrid.api.Models.AuditEvent;
import com.hydrogrid.config.LiveUpdates;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static java.util.UUID.randomUUID;

@Component
public class SessionStore {
    private final JdbcClient db;
    private final SpatialGraph graph;
    private final LiveUpdates updates;

    SessionStore(JdbcClient db, SpatialGraph graph, LiveUpdates updates) {
        this.db = db;
        this.graph = graph;
        this.updates = updates;
    }

    @Transactional
    public void ensureSession(UUID session) {
        int inserted = db.sql("INSERT INTO demo_sessions(id) VALUES (:id) ON CONFLICT DO NOTHING")
                .param("id", session).update();
        if (inserted == 0) {
            db.sql("UPDATE demo_sessions SET accessed_at = clock_timestamp() WHERE id = :id")
                    .param("id", session).update();
            return;
        }

        var unit = seedUnit(session, "Rapid 01", "N05", 8, "BUSY", "{BOAT,MEDICAL}");
        seedUnit(session, "River 02", "N08", 5, "AVAILABLE", "{BOAT,MEDICAL}");
        seedUnit(session, "Rescue 03", "N13", 12, "AVAILABLE", "{BOAT,HIGH_CLEARANCE}");
        seedUnit(session, "Medic 04", "N04", 4, "AVAILABLE", "{MEDICAL,HIGH_CLEARANCE}");
        seedUnit(session, "Ranger 05", "N10", 6, "AVAILABLE", "{HIGH_CLEARANCE,MEDICAL}");
        seedUnit(session, "River 06", "N16", 10, "AVAILABLE", "{BOAT,MEDICAL}");
        seedShelter(session, "Central Relief Hub", "RELIEF", "N08", 80, 31);
        seedShelter(session, "North Field Hospital", "MEDICAL", "N04", 35, 19);
        seedShelter(session, "South Community Centre", "RELIEF", "N13", 120, 12);
        seedShelter(session, "East Medical Station", "MEDICAL", "N16", 42, 8);

        seedIncident(session, "Families stranded on a rooftop", "FLOOD", "CRITICAL", 6, false, true, 120, true, "N06", 17, null);
        seedIncident(session, "Floodwater at a residential block", "FLOOD", "HIGH", 4, false, true, 65, false, "N07", 13, null);
        seedIncident(session, "Medical aid at an evacuation point", "MEDICAL", "HIGH", 2, true, false, 0, false, "N03", 22, null);
        seedIncident(session, "Access road obstruction", "INFRASTRUCTURE", "MEDIUM", 5, false, false, 0, false, "N15", 9, null);
        seedIncident(session, "Water entering the ground floor", "FLOOD", "MEDIUM", 3, false, false, 30, false, "N11", 8, null);
        seedIncident(session, "Rescue team dispatched to riverside", "FLOOD", "HIGH", 4, false, false, 75, false, "N09", 27, unit);
    }

    @Scheduled(initialDelayString = "PT12H", fixedDelayString = "PT12H")
    public void removeInactiveSessions() {
        db.sql("DELETE FROM demo_sessions WHERE accessed_at < now() - interval '48 hours'").update();
    }

    public int intensity(UUID session) {
        if (session == null) return 0;
        return db.sql("SELECT intensity FROM demo_sessions WHERE id = :id").param("id", session)
                .query(Integer.class).single();
    }

    public int lockHazardSnapshot(UUID session) {
        return db.sql("SELECT intensity FROM demo_sessions WHERE id = :id FOR SHARE").param("id", session)
                .query(Integer.class).single();
    }

    @Transactional
    public com.hydrogrid.api.Models.Graph setIntensity(UUID session, int intensity) {
        db.sql("UPDATE demo_sessions SET intensity = :intensity WHERE id = :id")
                .param("intensity", intensity).param("id", session).update();
        record(session, null, "HAZARD_CHANGED", "Flood intensity set to " + intensity + "%");
        updates.publish(session, "HAZARD_CHANGED", null);
        return graph.snapshot(intensity);
    }

    public List<AuditEvent> audit(UUID session, UUID incident) {
        var query = db.sql("""
                SELECT id, incident_id, type, detail, created_at FROM audit_events WHERE session_id = :session
                """ + (incident == null ? " ORDER BY created_at DESC, id LIMIT 250"
                : " AND incident_id = :incident ORDER BY created_at, id"));
        query.param("session", session);
        if (incident != null) query.param("incident", incident);
        return query.query((row, number) -> new AuditEvent(
                row.getObject("id", UUID.class), row.getObject("incident_id", UUID.class),
                row.getString("type"), row.getString("detail"), row.getTimestamp("created_at").toInstant())).list();
    }

    public void record(UUID session, UUID incidentId, String type, String detail) {
        db.sql("""
                INSERT INTO audit_events(id, session_id, incident_id, type, detail)
                VALUES (:id, :session, :incident, :type, :detail)
                """).param("id", randomUUID()).param("session", session).param("incident", incidentId)
                .param("type", type).param("detail", detail).update();
    }

    private UUID seedUnit(UUID session, String name, String nodeId, int capacity, String status, String equipment) {
        UUID id = randomUUID();
        db.sql("""
                INSERT INTO rescue_units(id, session_id, name, node_id, capacity, equipment, status)
                VALUES (:id, :session, :name, :node, :capacity, CAST(:equipment AS text[]), :status)
                """).param("id", id).param("session", session).param("name", name).param("node", nodeId)
                .param("capacity", capacity).param("equipment", equipment).param("status", status).update();
        return id;
    }

    private void seedShelter(UUID session, String name, String type, String node, int capacity, int admitted) {
        db.sql("""
                INSERT INTO shelters(id, session_id, name, type, node_id, capacity, admitted)
                VALUES (:id, :session, :name, :type, :node, :capacity, :admitted)
                """).param("id", randomUUID()).param("session", session).param("name", name).param("type", type)
                .param("node", node).param("capacity", capacity).param("admitted", admitted).update();
    }

    private void seedIncident(UUID session, String summary, String hazard, String severity, int people,
                              boolean medical, boolean vulnerable, int depth, boolean danger, String node,
                              long ageMinutes, UUID assignedUnit) {
        var id = randomUUID();
        var when = java.sql.Timestamp.from(Instant.now().minusSeconds(ageMinutes * 60));
        db.sql("""
                INSERT INTO incidents(id, session_id, client_id, summary, hazard, people, medical, vulnerable,
                       depth_cm, immediate_danger, position, node_id, reported_severity, status, assigned_unit_id, created_at)
                SELECT :id, :session, :client, :summary, :hazard, :people, :medical, :vulnerable, :depth,
                       :danger, position, id, :severity, :status, :unit, :when FROM graph_nodes WHERE id = :node
                """).param("id", id).param("session", session).param("client", randomUUID())
                .param("summary", summary).param("hazard", hazard).param("people", people).param("medical", medical)
                .param("vulnerable", vulnerable).param("depth", depth).param("danger", danger).param("node", node)
                .param("severity", severity).param("status", assignedUnit == null ? "REPORTED" : "EN_ROUTE")
                .param("unit", assignedUnit).param("when", when).update();
        record(session, id, "SOS_REPORTED", "Synthetic SOS staged in the command center");
        if (assignedUnit != null) record(session, id, "UNIT_DISPATCHED", "Rapid 01 is en route");
    }
}
