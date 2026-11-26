package com.hydrogrid.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.net.ssl.HttpsURLConnection;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
class TrafficFeed {
    private static final URI TOKEN_URI = URI.create("https://cos.iudx.org.in/auth/v1/token");
    private static final String RESOURCE_SERVER = "rs.cos.iudx.org.in";
    private static final String EVENTS_URI = "https://" + RESOURCE_SERVER + "/ngsi-ld/v1/temporal/entities";
    private static final String RESOURCE_ID = "0bb06335-09b0-4209-a2b0-d27953f301b3";
    private static final int LIMIT = 25;
    private static final int MAX_BODY_BYTES = 256_000;
    private static final Duration LOOKBACK = Duration.ofHours(2);
    private static final Duration REFRESH_INTERVAL = Duration.ofMinutes(5);
    private static final Duration STALE_LIMIT = Duration.ofMinutes(30);

    private final Clock clock;
    private final EventReader reader;
    private Instant refreshAfter = Instant.MIN;
    private Snapshot snapshot;

    @Autowired
    TrafficFeed(ObjectMapper mapper,
                @Value("${HYDROGRID_IUDX_CLIENT_ID:}") String clientId,
                @Value("${HYDROGRID_IUDX_CLIENT_SECRET:}") String clientSecret) {
        this(Clock.systemUTC(), clientId.isBlank() || clientSecret.isBlank()
                ? null : new IudxReader(mapper, clientId, clientSecret));
    }

    TrafficFeed(Clock clock, EventReader reader) {
        this.clock = clock;
        this.reader = reader;
        this.snapshot = new Snapshot(reader == null ? "not_configured" : "unavailable", null, null, List.of());
    }

    synchronized Snapshot events() {
        Instant now = clock.instant();
        if (reader == null || now.isBefore(refreshAfter)) return snapshot;
        Instant since = now.minus(LOOKBACK);
        try {
            snapshot = new Snapshot("available", clock.instant(), since, parse(reader.read(since, now), since, now));
        } catch (IOException failure) {
            Instant lastSuccess = snapshot.checkedAt();
            if (lastSuccess != null && now.isBefore(lastSuccess.plus(STALE_LIMIT))) {
                snapshot = new Snapshot("stale", lastSuccess, snapshot.since(), snapshot.events());
            } else {
                snapshot = new Snapshot("unavailable", lastSuccess, null, List.of());
            }
        }
        refreshAfter = clock.instant().plus(REFRESH_INTERVAL);
        if ("stale".equals(snapshot.status()) && snapshot.checkedAt().plus(STALE_LIMIT).isBefore(refreshAfter)) {
            refreshAfter = snapshot.checkedAt().plus(STALE_LIMIT);
        }
        return snapshot;
    }

    static List<Event> parse(JsonNode response, Instant since, Instant now) throws IOException {
        if (response == null || !response.path("results").isArray()) {
            throw new IOException("Unexpected IUDX traffic response");
        }
        var latest = new HashMap<String, Revision>();
        for (JsonNode row : response.path("results")) {
            String id = text(row, "reportID", 64);
            String title = text(row, "eventTitle", 120);
            JsonNode closure = row.path("roadClosure");
            Instant observedAt = timestamp(row, "observationDateTime");
            if (id == null || title == null || !closure.isBoolean() || observedAt == null ||
                    observedAt.isBefore(since) || observedAt.isAfter(now.plus(Duration.ofMinutes(2)))) continue;
            Instant modified = timestamp(row, "modifiedDateTime");
            var event = new Event(id, title, observedAt, timestamp(row, "endDateTime"),
                    closure.booleanValue(), text(row, "resolutionStatus", 80));
            latest.merge(id, new Revision(event, modified == null ? observedAt : modified),
                    (left, right) -> right.changedAt().isAfter(left.changedAt()) ? right : left);
        }
        if (!response.path("results").isEmpty() && latest.isEmpty()) {
            throw new IOException("No current rows matched the IUDX traffic schema");
        }
        return latest.values().stream().map(Revision::event)
                .sorted(Comparator.comparing(Event::observedAt).reversed().thenComparing(Event::id))
                .limit(LIMIT).toList();
    }

    private static String text(JsonNode node, String field, int maximum) {
        JsonNode value = node.path(field);
        if (!value.isTextual()) return null;
        String text = value.asText().strip();
        return text.isEmpty() || text.length() > maximum ? null : text;
    }

    private static Instant timestamp(JsonNode node, String field) {
        String value = text(node, field, 64);
        if (value == null) return null;
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    private static final class IudxReader implements EventReader {
        private final ObjectMapper mapper;
        private final String clientId;
        private final String clientSecret;
        private String token;
        private Instant tokenExpiry = Instant.MIN;

        private IudxReader(ObjectMapper mapper, String clientId, String clientSecret) {
            this.mapper = mapper;
            this.clientId = clientId;
            this.clientSecret = clientSecret;
        }

        @Override
        public JsonNode read(Instant since, Instant now) throws IOException {
            if (token == null || !now.plusSeconds(45).isBefore(tokenExpiry)) refreshToken();
            String start = URLEncoder.encode(since.truncatedTo(ChronoUnit.SECONDS).toString(), StandardCharsets.UTF_8);
            String end = URLEncoder.encode(now.truncatedTo(ChronoUnit.SECONDS).toString(), StandardCharsets.UTF_8);
            URI resource = URI.create(EVENTS_URI + "?id=" + RESOURCE_ID + "&timerel=during&time=" + start
                    + "&endtime=" + end + "&limit=" + LIMIT);
            try {
                return query(resource, Map.of("token", token), null);
            } catch (IudxHttpError error) {
                if (error.status == 401 || error.status == 403) token = null;
                throw error;
            }
        }

        private void refreshToken() throws IOException {
            byte[] request = mapper.writeValueAsBytes(Map.of("itemId", RESOURCE_SERVER,
                    "itemType", "resource_server", "role", "consumer"));
            JsonNode response = query(TOKEN_URI, Map.of("clientId", clientId, "clientSecret", clientSecret), request);
            JsonNode result = response.path("results");
            String accessToken = text(result, "accessToken", 8192);
            long expiresAt = result.path("expiry").asLong(0);
            if (accessToken == null || expiresAt <= 0 || expiresAt > 253402300799L) {
                throw new IOException("IUDX supplied no usable access token");
            }
            token = accessToken;
            tokenExpiry = Instant.ofEpochSecond(expiresAt);
        }

        private JsonNode query(URI uri, Map<String, String> headers, byte[] body) throws IOException {
            var connection = (HttpsURLConnection) uri.toURL().openConnection();
            connection.setConnectTimeout(2_000);
            connection.setReadTimeout(3_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/json");
            headers.forEach(connection::setRequestProperty);
            try {
                if (body != null) {
                    connection.setRequestMethod("POST");
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setDoOutput(true);
                    try (var out = connection.getOutputStream()) {
                        out.write(body);
                    }
                }
                int status = connection.getResponseCode();
                if (status == 204 && body == null) return mapper.createObjectNode().set("results", mapper.createArrayNode());
                if (status != 200 && !(status == 201 && body != null)) throw new IudxHttpError(status);
                try (var input = connection.getInputStream()) {
                    byte[] data = input.readNBytes(MAX_BODY_BYTES + 1);
                    if (data.length > MAX_BODY_BYTES) throw new IOException("IUDX response exceeded its size limit");
                    JsonNode result = mapper.readTree(data);
                    if (result == null || !result.isObject()) throw new IOException("IUDX returned invalid JSON");
                    return result;
                }
            } finally {
                connection.disconnect();
            }
        }
    }

    private static final class IudxHttpError extends IOException {
        private final int status;

        private IudxHttpError(int status) {
            super("IUDX returned HTTP " + status);
            this.status = status;
        }
    }

    @FunctionalInterface
    interface EventReader {
        JsonNode read(Instant since, Instant now) throws IOException;
    }

    private record Revision(Event event, Instant changedAt) {}

    record Snapshot(String status, Instant checkedAt, Instant since, List<Event> events) {}

    record Event(String id, String title, Instant observedAt, Instant endsAt, boolean roadClosure, String resolution) {}
}
