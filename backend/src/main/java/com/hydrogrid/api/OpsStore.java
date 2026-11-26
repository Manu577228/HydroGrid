package com.hydrogrid.api;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Types;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static com.hydrogrid.api.OpsAuthorizer.Scope;

@Repository
class OpsStore {
    private static final String OBSERVATION_COLUMNS = """
            kind, site_id, label, ST_Y(position) AS lat, ST_X(position) AS lng, observed_at,
            expires_at, source_ref, value, capacity, occupancy, state, reported_by
            """;

    private final JdbcClient database;
    private final OpsAuthorizer authorizer;

    OpsStore(JdbcClient database, OpsAuthorizer authorizer) {
        this.database = database;
        this.authorizer = authorizer;
    }

    List<Observation> observations() {
        return database.sql("""
                SELECT %s FROM (
                    SELECT *, row_number() OVER (PARTITION BY kind ORDER BY observed_at DESC, site_id) AS rank
                    FROM ops_observations
                ) latest WHERE rank <= 100
                ORDER BY kind, observed_at DESC, site_id
                """.formatted(OBSERVATION_COLUMNS)).query(Observation.class).list();
    }

    @Transactional
    public Observation writeObservation(Observation entry) {
        var accepted = database.sql("""
                WITH written AS (
                    INSERT INTO ops_observations (kind, site_id, label, position, observed_at, expires_at,
                                                  source_ref, value, capacity, occupancy, state, reported_by)
                    VALUES (:kind, :site, :label, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :observed,
                            :expires, :source, :value, :capacity, :occupancy, :state, :operator)
                    ON CONFLICT (kind, site_id) DO UPDATE SET
                        label = EXCLUDED.label, position = EXCLUDED.position,
                        observed_at = EXCLUDED.observed_at, expires_at = EXCLUDED.expires_at,
                        source_ref = EXCLUDED.source_ref, value = EXCLUDED.value, capacity = EXCLUDED.capacity,
                        occupancy = EXCLUDED.occupancy, state = EXCLUDED.state, reported_by = EXCLUDED.reported_by
                    WHERE ops_observations.observed_at < EXCLUDED.observed_at
                    RETURNING *
                ), audit AS (
                    INSERT INTO ops_observation_history SELECT *, now() FROM written
                )
                SELECT %s FROM written
                """.formatted(OBSERVATION_COLUMNS))
                .param("kind", entry.kind().name()).param("site", entry.siteId()).param("label", entry.label())
                .param("lat", entry.lat()).param("lng", entry.lng()).param("observed", entry.observedAt())
                .param("expires", entry.expiresAt()).param("source", entry.sourceRef())
                .param("value", entry.value(), Types.DOUBLE).param("capacity", entry.capacity(), Types.INTEGER)
                .param("occupancy", entry.occupancy(), Types.INTEGER)
                .param("state", entry.state() == null ? null : entry.state().name(), Types.VARCHAR)
                .param("operator", entry.reportedBy()).query(Observation.class).optional();
        if (accepted.isPresent()) return accepted.get();

        // A separate statement gets a fresh snapshot after a concurrent write releases its row lock.
        return database.sql("""
                SELECT %s FROM ops_observation_history
                WHERE kind = :kind AND site_id = :site AND observed_at = :observed
                """.formatted(OBSERVATION_COLUMNS)).param("kind", entry.kind().name()).param("site", entry.siteId())
                .param("observed", entry.observedAt())
                .query(Observation.class).optional().filter(entry::equals)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                        "A newer observation or a different observation at this timestamp already exists"));
    }

    List<Handoff> handoffs() {
        return database.sql("""
                SELECT id, reference, state, updated_at, reported_by FROM ops_handoffs
                ORDER BY (state = 'CLOSED'), updated_at DESC, id LIMIT 100
                """).query(Handoff.class).list();
    }

    @Transactional
    public Handoff writeHandoff(UUID id, String reference, HandoffState expected, HandoffState next, String operator) {
        // Only the current holder of the expected state can advance it.
        var change = expected == null
                ? database.sql("""
                        INSERT INTO ops_handoffs (id, reference, state, updated_at, reported_by)
                        VALUES (:id, :reference, :next, clock_timestamp(), :operator)
                        ON CONFLICT DO NOTHING
                        RETURNING id, reference, state, updated_at, reported_by
                        """)
                : database.sql("""
                        UPDATE ops_handoffs SET state = :next, reported_by = :operator, updated_at = clock_timestamp()
                        WHERE id = :id AND reference = :reference AND state = :expected
                        RETURNING id, reference, state, updated_at, reported_by
                        """).param("expected", expected.name());

        var changed = change.param("id", id).param("reference", reference).param("next", next.name())
                .param("operator", operator).query(Handoff.class).optional();
        if (changed.isEmpty()) {
            return database.sql("""
                    SELECT id, reference, state, updated_at, reported_by FROM ops_handoff_events
                    WHERE id = :id AND reference = :reference AND state = :state
                    """).param("id", id).param("reference", reference).param("state", next.name())
                    .query(Handoff.class).optional()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                            "The handoff does not match the reference and current state"));
        }

        var receipt = changed.get();
        database.sql("""
                INSERT INTO ops_handoff_events (id, reference, state, updated_at, reported_by)
                VALUES (:id, :reference, :state, :updated, :operator)
                """).param("id", id).param("reference", reference).param("state", next.name())
                .param("updated", receipt.updatedAt()).param("operator", operator).update();
        return receipt;
    }

    @Scheduled(fixedDelayString = "PT24H", initialDelayString = "PT10M")
    void expireHistory() {
        if (!authorizer.available()) return;
        database.sql("DELETE FROM ops_observation_history WHERE recorded_at <= now() - INTERVAL '30 days'").update();
        database.sql("DELETE FROM ops_handoffs WHERE state = 'CLOSED' AND updated_at <= now() - INTERVAL '30 days'").update();
    }

    enum Kind {
        FLOOD(Scope.FLOOD, Duration.ofMinutes(30)),
        TRAFFIC(Scope.TRAFFIC, Duration.ofHours(2)),
        SHELTER(Scope.SHELTER, Duration.ofHours(1));

        final Scope scope;
        final Duration validity;

        Kind(Scope scope, Duration validity) {
            this.scope = scope;
            this.validity = validity;
        }
    }

    enum SiteState { OPEN, CLOSED }

    enum HandoffState {
        RELAYED, ACKNOWLEDGED, CLOSED;

        HandoffState prior() {
            return switch (this) {
                case RELAYED -> null;
                case ACKNOWLEDGED -> RELAYED;
                case CLOSED -> ACKNOWLEDGED;
            };
        }
    }

    record Observation(Kind kind, String siteId, String label, double lat, double lng, OffsetDateTime observedAt,
                       OffsetDateTime expiresAt, String sourceRef, Double value, Integer capacity, Integer occupancy,
                       SiteState state, String reportedBy) {}

    record Handoff(UUID id, String reference, HandoffState state, OffsetDateTime updatedAt, String reportedBy) {}
}
