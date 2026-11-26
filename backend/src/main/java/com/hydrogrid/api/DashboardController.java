package com.hydrogrid.api;

import com.hydrogrid.api.Models.AuditEvent;
import com.hydrogrid.api.Models.Hazard;
import com.hydrogrid.api.Models.Incident;
import com.hydrogrid.api.Models.Severity;
import com.hydrogrid.api.Models.Shelter;
import com.hydrogrid.api.Models.Status;
import com.hydrogrid.api.Models.Unit;
import com.hydrogrid.store.IncidentStore;
import com.hydrogrid.store.SessionStore;
import com.hydrogrid.store.ShelterStore;
import com.hydrogrid.store.SpatialGraph;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasRole('COORDINATOR')")
class DashboardController {
    private static final ZoneId EXERCISE_ZONE = ZoneId.of("Asia/Kolkata");
    private static final Duration MAX_INCIDENT_RANGE = Duration.ofDays(7);
    private static final int PAGE_SIZE = 20;
    private static final OffsetDateTime BUCKET_ORIGIN = OffsetDateTime.parse("1970-01-01T00:00:00+05:30");
    private final JdbcClient db;
    private final IncidentStore incidents;
    private final SessionStore sessions;
    private final ShelterStore shelters;
    private final SpatialGraph graph;

    DashboardController(JdbcClient db, IncidentStore incidents, SessionStore sessions, ShelterStore shelters, SpatialGraph graph) {
        this.db = db;
        this.incidents = incidents;
        this.sessions = sessions;
        this.shelters = shelters;
        this.graph = graph;
    }

    @GetMapping
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Dashboard dashboard(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "6") int hours) {
        if (!List.of(1, 6, 24, 48).contains(hours)) throw invalid("Choose a supported dashboard period");
        UUID session = OperationsController.session(jwt);
        Instant now = Instant.now();
        Instant since = now.minus(Duration.ofHours(hours));
        long bucketSeconds = hours == 1 ? 300 : hours == 6 ? 1800 : 3600;
        var records = incidents.list(session, false);
        var inPeriod = records.stream().filter(record -> !record.createdAt().isBefore(since)).toList();
        var active = records.stream().filter(record -> record.status() != Status.RESOLVED).toList();
        var units = incidents.units(session);
        var locations = shelters.list(session);
        var response = responseTimes(session, since, now, bucketSeconds);
        var currentGraph = graph.snapshot(sessions.intensity(session));
        int occupied = locations.stream().mapToInt(Shelter::admitted).sum();
        int reserved = locations.stream().mapToInt(Shelter::reserved).sum();
        int available = locations.stream().mapToInt(Shelter::available).sum();
        var summary = new Summary(active.size(), active.stream().filter(i -> i.severity().equals("CRITICAL")).count(),
                inPeriod.stream().mapToLong(Incident::people).sum(), records.size() - active.size(),
                units.stream().filter(unit -> "AVAILABLE".equals(unit.status())).count(),
                units.stream().filter(unit -> "BUSY".equals(unit.status())).count(),
                active.stream().filter(i -> i.assignedUnitId() != null).count(),
                occupied, reserved, available, occupied + reserved + available, currentGraph.blockedRoadIds().size(),
                response.stream().filter(p -> p.bucket() == null).findFirst().map(ResponsePoint::dispatch).orElse(null));
        long[] hourCounts = new long[24];
        inPeriod.forEach(report -> hourCounts[report.createdAt().atZone(EXERCISE_ZONE).getHour()]++);
        var recent = db.sql("""
                SELECT id, incident_id, type, detail, created_at
                FROM audit_events WHERE session_id = :session ORDER BY created_at DESC, id LIMIT 8
                """).param("session", session).query((row, n) -> new AuditEvent(row.getObject("id", UUID.class),
                row.getObject("incident_id", UUID.class), row.getString("type"), row.getString("detail"),
                row.getObject("created_at", OffsetDateTime.class).toInstant())).list();
        var critical = active.stream().filter(i -> i.severity().equals("CRITICAL")).limit(6).toList();
        return new Dashboard(now, since, bucketSeconds, summary, activity(session, since, now, bucketSeconds),
                response.stream().filter(p -> p.bucket() != null).toList(),
                counts(inPeriod, Incident::severity, Arrays.stream(Severity.values()).map(Enum::name).toList()),
                counts(inPeriod, i -> i.hazard().name(), Arrays.stream(Hazard.values()).map(Enum::name).toList()),
                counts(records, i -> i.status().name(), Arrays.stream(Status.values()).map(Enum::name).toList()),
                Arrays.stream(hourCounts).boxed().toList(), units, locations, recent, critical,
                active.stream().limit(100).map(i -> new MapPin(i.id(), i.summary(), i.severity(), i.lat(), i.lng())).toList());
    }

    @GetMapping("/incidents")
    IncidentPage incidentPage(@AuthenticationPrincipal Jwt jwt,
                              @RequestParam(defaultValue = "1") int page,
                              @RequestParam(defaultValue = "") String q,
                              @RequestParam(required = false) Severity severity,
                              @RequestParam(required = false) Hazard hazard,
                              @RequestParam(required = false) Status status,
                              @RequestParam(required = false) Instant start,
                              @RequestParam(required = false) Instant end,
                              @RequestParam(defaultValue = "PRIORITY") Sort sort) {
        if (page < 1 || q.length() > 100) throw invalid("Choose a positive page and a search term up to 100 characters");
        Instant now = Instant.now();
        Instant lower = start == null ? (end == null ? now : end).minus(MAX_INCIDENT_RANGE) : start;
        Instant upper = end == null ? now : end;
        if (!upper.isAfter(lower) || Duration.between(lower, upper).compareTo(MAX_INCIDENT_RANGE) > 0) {
            throw invalid("Choose a date range up to seven days");
        }
        UUID session = OperationsController.session(jwt);
        String term = q.strip().toLowerCase(Locale.ROOT);
        Map<String, String> nodeNames = term.isEmpty() ? Map.of() : graph.engine().graph().nodes().stream()
                .collect(Collectors.toMap(node -> node.id(), node -> node.label().toLowerCase(Locale.ROOT)));
        var rows = incidents.list(session, false).stream()
                .filter(i -> !i.createdAt().isBefore(lower) && i.createdAt().isBefore(upper))
                .filter(i -> severity == null || severity.name().equals(i.severity()))
                .filter(i -> hazard == null || hazard == i.hazard())
                .filter(i -> status == null || status == i.status())
                .filter(i -> term.isEmpty() || i.id().toString().contains(term) || i.summary().toLowerCase(Locale.ROOT).contains(term)
                        || i.nodeId().toLowerCase(Locale.ROOT).contains(term) || nodeNames.getOrDefault(i.nodeId(), "").contains(term))
                .sorted(sort.order.thenComparing(Incident::id)).toList();
        int last = Math.max(1, (rows.size() + PAGE_SIZE - 1) / PAGE_SIZE);
        int selected = Math.min(page, last);
        int offset = (selected - 1) * PAGE_SIZE;
        return new IncidentPage(rows.subList(offset, Math.min(offset + PAGE_SIZE, rows.size())), rows.size(), selected, last);
    }

    @GetMapping("/incidents/{id}")
    Incident incident(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return incidents.detail(OperationsController.session(jwt), id);
    }

    private List<ActivityPoint> activity(UUID session, Instant since, Instant now, long step) {
        var rows = db.sql("""
                WITH dated AS (
                    SELECT created_at AS moment, true AS reported FROM incidents
                    WHERE session_id = :session AND created_at >= :since AND created_at <= :now
                    UNION ALL
                    SELECT created_at AS moment, false AS reported FROM audit_events
                    WHERE session_id = :session AND type = 'MISSION_RESOLVED'
                      AND created_at >= :since AND created_at <= :now
                )
                SELECT date_bin(:step * interval '1 second', moment, CAST(:bucketOrigin AS timestamptz)) AS bucket,
                       count(*) FILTER (WHERE reported) AS reported,
                       count(*) FILTER (WHERE NOT reported) AS resolved
                FROM dated GROUP BY 1 ORDER BY 1
                """)
                .param("session", session).param("since", OffsetDateTime.ofInstant(since, EXERCISE_ZONE))
                .param("now", OffsetDateTime.ofInstant(now, EXERCISE_ZONE)).param("step", step).param("bucketOrigin", BUCKET_ORIGIN)
                .query((row, n) -> new ActivityPoint(row.getObject("bucket", OffsetDateTime.class).toInstant(),
                        row.getLong("reported"), row.getLong("resolved"))).list();
        var byBucket = rows.stream().collect(Collectors.toMap(ActivityPoint::bucket, Function.identity()));
        long origin = BUCKET_ORIGIN.toEpochSecond();
        long first = origin + Math.floorDiv(since.getEpochSecond() - origin, step) * step;
        return java.util.stream.LongStream.iterate(first, value -> value <= now.getEpochSecond(), value -> value + step)
                .mapToObj(Instant::ofEpochSecond)
                .map(bucket -> byBucket.getOrDefault(bucket, new ActivityPoint(bucket, 0, 0))).toList();
    }

    private List<ResponsePoint> responseTimes(UUID session, Instant since, Instant now, long step) {
        return db.sql("""
                WITH milestones AS (
                    SELECT incident_id,
                           min(created_at) FILTER (WHERE type = 'SOS_REPORTED') AS reported_at,
                           min(created_at) FILTER (WHERE type = 'UNIT_DISPATCHED' AND detail LIKE '% assigned') AS dispatched_at,
                           min(created_at) FILTER (WHERE type = 'MISSION_ON_SCENE') AS arrived_at,
                           min(created_at) FILTER (WHERE type = 'MISSION_RESOLVED') AS resolved_at
                    FROM audit_events WHERE session_id = :session AND incident_id IS NOT NULL GROUP BY incident_id
                ), durations AS (
                    SELECT date_bin(:step * interval '1 second', metric.moment, CAST(:bucketOrigin AS timestamptz)) AS bucket,
                           metric.kind, extract(epoch FROM metric.moment - metric.origin) / 60.0 AS minutes
                    FROM milestones
                    CROSS JOIN LATERAL (VALUES ('dispatch', dispatched_at, reported_at),
                        ('arrival', arrived_at, dispatched_at), ('resolution', resolved_at, reported_at)) metric(kind, moment, origin)
                    WHERE metric.moment >= :since AND metric.moment <= :now AND metric.moment >= metric.origin
                )
                SELECT bucket,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE kind = 'dispatch') AS dispatch,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE kind = 'arrival') AS arrival,
                    percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FILTER (WHERE kind = 'resolution') AS resolution
                FROM durations GROUP BY GROUPING SETS ((bucket), ()) ORDER BY bucket
                """)
                .param("session", session).param("since", OffsetDateTime.ofInstant(since, EXERCISE_ZONE))
                .param("now", OffsetDateTime.ofInstant(now, EXERCISE_ZONE)).param("step", step).param("bucketOrigin", BUCKET_ORIGIN)
                .query((row, n) -> {
                    var time = row.getObject("bucket", OffsetDateTime.class);
                    return new ResponsePoint(time == null ? null : time.toInstant(), row.getObject("dispatch", Double.class),
                            row.getObject("arrival", Double.class), row.getObject("resolution", Double.class));
                }).list();
    }

    private static List<Count> counts(List<Incident> records, Function<Incident, String> key, List<String> keys) {
        Map<String, Long> byKey = records.stream().collect(Collectors.groupingBy(key, HashMap::new, Collectors.counting()));
        return keys.stream().map(label -> new Count(label, byKey.getOrDefault(label, 0L))).toList();
    }

    private static ResponseStatusException invalid(String detail) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
    }

    enum Sort {
        PRIORITY(Comparator.comparingInt(Incident::score).reversed().thenComparing(Incident::createdAt)),
        NEWEST(Comparator.comparing(Incident::createdAt).reversed()),
        OLDEST(Comparator.comparing(Incident::createdAt)),
        PEOPLE(Comparator.comparingInt(Incident::people).reversed().thenComparing(Incident::createdAt));

        final Comparator<Incident> order;
        Sort(Comparator<Incident> order) { this.order = order; }
    }

    record Dashboard(Instant generatedAt, Instant since, long bucketSeconds, Summary summary, List<ActivityPoint> activity,
                     List<ResponsePoint> response, List<Count> severity, List<Count> categories, List<Count> lifecycle,
                     List<Long> hourly, List<Unit> units, List<Shelter> shelters, List<AuditEvent> recent,
                     List<Incident> critical, List<MapPin> mapIncidents) {}
    record Summary(long active, long critical, long people, long resolved, long availableUnits,
                   long busyUnits, long missions, int occupied, int reserved, int availablePlaces, int capacity,
                   int blockedRoads, Double medianDispatch) {}
    record ActivityPoint(Instant bucket, long reported, long resolved) {}
    record ResponsePoint(Instant bucket, Double dispatch, Double arrival, Double resolution) {}
    record Count(String key, long value) {}
    record MapPin(UUID id, String summary, String severity, double lat, double lng) {}
    record IncidentPage(List<Incident> items, int total, int page, int pages) {}
}
