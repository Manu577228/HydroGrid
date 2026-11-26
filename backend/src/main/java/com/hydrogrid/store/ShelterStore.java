package com.hydrogrid.store;

import com.hydrogrid.api.Models.Hazard;
import com.hydrogrid.api.Models.Reservation;
import com.hydrogrid.api.Models.ReservationRequest;
import com.hydrogrid.api.Models.Shelter;
import com.hydrogrid.api.Models.ShelterRecommendation;
import com.hydrogrid.config.LiveUpdates;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import static com.hydrogrid.store.IncidentStore.conflict;
import static com.hydrogrid.store.IncidentStore.missing;
import static java.util.UUID.randomUUID;

@Service
public class ShelterStore {
    private static final String SHELTER_SELECT = """
            SELECT s.*, ST_Y(n.position) lat, ST_X(n.position) lng
            FROM shelters s JOIN graph_nodes n ON n.id = s.node_id WHERE s.session_id = :session
            """;
    private static final String RESERVATION_SELECT = """
            SELECT * FROM reservations WHERE session_id = :session
            """;
    private final JdbcClient db;
    private final SpatialGraph graph;
    private final IncidentStore incidents;
    private final SessionStore sessions;
    private final LiveUpdates updates;

    public ShelterStore(JdbcClient db, SpatialGraph graph, IncidentStore incidents, SessionStore sessions, LiveUpdates updates) {
        this.db = db;
        this.graph = graph;
        this.incidents = incidents;
        this.sessions = sessions;
        this.updates = updates;
    }

    public List<Shelter> list(UUID session) {
        return db.sql(SHELTER_SELECT + " ORDER BY name").param("session", session)
                .query(ShelterStore::readShelter).list();
    }

    public List<ShelterRecommendation> recommend(UUID session, UUID incidentId) {
        var incident = incidents.get(session, incidentId, false);
        var blockedRoads = graph.snapshot(sessions.intensity(session)).blockedRoadIds();
        boolean medical = incident.medical() || incident.hazard() == Hazard.MEDICAL;
        return db.sql(SHELTER_SELECT + """
                 AND s.capacity - s.reserved - s.admitted >= :people AND (:medical = false OR s.type = 'MEDICAL')
                """).param("session", session).param("people", incident.people()).param("medical", medical)
                .query((r, n) -> new ShelterRecommendation(readShelter(r, n),
                        graph.engine().route(incident.nodeId(), r.getString("node_id"), blockedRoads)))
                .list().stream().filter(option -> option.route().reachable())
                .sorted(Comparator.comparingDouble(option -> option.route().travelMinutes())).toList();
    }

    public List<Reservation> reservations(UUID session, UUID shelterId) {
        get(session, shelterId, false);
        return db.sql(RESERVATION_SELECT + " AND shelter_id = :shelter ORDER BY created_at DESC, id")
                .param("session", session).param("shelter", shelterId).query(ShelterStore::readReservation).list();
    }

    @Transactional
    public Reservation reserve(UUID session, UUID shelterId, ReservationRequest request) {
        Shelter shelter = get(session, shelterId, true);
        var existing = byClient(session, request.clientId());
        if (existing.isPresent()) return matching(existing.get(), shelterId, request);
        if (request.incidentId() != null) incidents.get(session, request.incidentId(), false);
        if (request.people() > shelter.available()) throw conflict("The shelter does not have enough remaining capacity");
        UUID id = randomUUID();

        int inserted = db.sql("""
                INSERT INTO reservations(id, session_id, shelter_id, incident_id, client_id, people, status)
                VALUES (:id, :session, :shelter, :incident, :client, :people, 'RESERVED')
                ON CONFLICT (session_id, client_id) DO NOTHING
                """).param("id", id).param("session", session).param("shelter", shelterId)
                .param("incident", request.incidentId()).param("client", request.clientId())
                .param("people", request.people()).update();
        if (inserted == 0) return matching(byClient(session, request.clientId()).orElseThrow(), shelterId, request);
        db.sql("UPDATE shelters SET reserved = reserved + :people WHERE id = :id")
                .param("people", request.people()).param("id", shelterId).update();
        sessions.record(session, request.incidentId(), "SHELTER_RESERVED",
                request.people() + " places reserved at " + shelter.name());
        updates.publish(session, "SHELTER_RESERVED", shelterId);
        return new Reservation(id, shelterId, request.incidentId(), request.people(), "RESERVED");
    }

    @Transactional
    public Reservation admit(UUID session, UUID shelterId, UUID reservationId) {
        var shelter = get(session, shelterId, true);
        var reservation = db.sql(RESERVATION_SELECT + " AND shelter_id = :shelter AND id = :id")
                .param("session", session).param("shelter", shelterId).param("id", reservationId)
                .query(ShelterStore::readReservation).optional()
                .orElseThrow(() -> missing("Reservation was not found"));
        if (reservation.status().equals("ADMITTED")) return reservation;

        db.sql("""
                UPDATE shelters SET reserved = reserved - :people, admitted = admitted + :people WHERE id = :id
                """).param("people", reservation.people()).param("id", shelterId).update();
        db.sql("UPDATE reservations SET status = 'ADMITTED' WHERE id = :id").param("id", reservationId).update();
        sessions.record(session, reservation.incidentId(), "SHELTER_ADMITTED",
                reservation.people() + " people admitted at " + shelter.name());
        updates.publish(session, "SHELTER_ADMITTED", shelterId);
        return new Reservation(reservation.id(), shelterId, reservation.incidentId(), reservation.people(), "ADMITTED");
    }

    private Shelter get(UUID session, UUID id, boolean locked) {
        return db.sql(SHELTER_SELECT + " AND s.id = :id" + (locked ? " FOR UPDATE OF s" : ""))
                .param("session", session).param("id", id).query(ShelterStore::readShelter).optional()
                .orElseThrow(() -> missing("Shelter was not found"));
    }

    private Optional<Reservation> byClient(UUID session, UUID clientId) {
        return db.sql(RESERVATION_SELECT + " AND client_id = :client").param("session", session)
                .param("client", clientId).query(ShelterStore::readReservation).optional();
    }

    private static Reservation matching(Reservation reservation, UUID shelter, ReservationRequest request) {
        if (reservation.shelterId().equals(shelter) && Objects.equals(reservation.incidentId(), request.incidentId())
                && reservation.people() == request.people()) return reservation;
        throw conflict("This reservation id already belongs to a different request");
    }

    private static Shelter readShelter(ResultSet r, int n) throws SQLException {
        int capacity = r.getInt("capacity");
        int reserved = r.getInt("reserved");
        int admitted = r.getInt("admitted");
        return new Shelter(r.getObject("id", UUID.class), r.getString("name"), r.getString("type"),
                r.getDouble("lat"), r.getDouble("lng"), capacity, reserved, admitted, capacity - reserved - admitted);
    }

    private static Reservation readReservation(ResultSet r, int n) throws SQLException {
        return new Reservation(r.getObject("id", UUID.class), r.getObject("shelter_id", UUID.class),
                r.getObject("incident_id", UUID.class), r.getInt("people"), r.getString("status"));
    }
}
