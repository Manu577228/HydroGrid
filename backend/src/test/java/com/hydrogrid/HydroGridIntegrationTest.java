package com.hydrogrid;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "hydrogrid.field-access-code=" + HydroGridIntegrationTest.TEST_FIELD_CODE)
class HydroGridIntegrationTest {
    static final String TEST_FIELD_CODE = "test-only-field-workspace-access-code";
    private static final String FLOOD_CODE = "integration-test-only-flood-account-code";
    private static final String DISPATCH_CODE = "integration-test-only-dispatch-account-code";
    private static final String VIEWER_CODE = "integration-test-only-traffic-viewer-access";
    private static final String COORDINATOR_CODE = "integration-test-only-ops-coordinator-code";

    @Container
    static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(DockerImageName.parse(
            System.getProperty("hydrogrid.postgis.image", "postgis/postgis:16-3.5"))
            .asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGIS::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGIS::getUsername);
        registry.add("spring.datasource.password", POSTGIS::getPassword);
        registry.add("hydrogrid.operator-accounts", () -> String.join(",",
                "qa-flood:FLOOD:" + sha256(FLOOD_CODE), "qa-dispatch:DISPATCH:" + sha256(DISPATCH_CODE),
                "qa-coordinator:COORDINATOR:" + sha256(COORDINATOR_CODE),
                "qa-viewer:TRAFFIC_VIEWER:" + sha256(VIEWER_CODE)));
    }

    @Autowired
    TestRestTemplate http;

    @Autowired
    SimpUserRegistry subscribers;

    @LocalServerPort
    int port;

    @Test
    void fieldAccessKeepsGpsAndTestReportsPrivateAndReplaysOnlyOnce() throws Exception {
        String boardPath = "/api/field/board";
        String locationPath = "/api/field/location";
        String reportPath = "/api/field/reports";
        var status = http.getForEntity("/api/field/status", JsonNode.class);
        assertThat(status.getBody().path("available").asBoolean()).isTrue();
        assertThat(http.getForEntity(boardPath, JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get(boardPath, token(UUID.randomUUID(), "COORDINATOR")).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(http.postForEntity("/api/field/access", Map.of("code", "incorrect"), JsonNode.class)
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        String owner = fieldToken();
        String observer = fieldToken();
        String device = get(boardPath, owner).getBody().path("deviceId").asText();
        assertThat(get("/api/incidents", owner).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(post(locationPath, owner, Map.of("label", "QA handset", "lat", 95, "lng", 77.6, "accuracy", 8))
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(post(locationPath, owner, Map.of("label", "QA handset", "lat", 12.97, "lng", 77.6, "accuracy", 8))
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(post(locationPath, owner, Map.of("label", "QA handset", "lat", 12.98, "lng", 77.6, "accuracy", 5))
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(request(locationPath, observer, null, HttpMethod.DELETE).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);

        var board = get(boardPath, observer);
        assertThat(board.getHeaders().getCacheControl()).contains("no-store");
        var positions = board.getBody().path("positions");
        assertThat(positions.size()).isEqualTo(1);
        assertThat(positions.get(0).path("id").asText()).isEqualTo(device);
        assertThat(positions.get(0).path("lat").asDouble()).isEqualTo(12.98);
        assertThat(request(locationPath, owner, null, HttpMethod.DELETE).getStatusCode())
                .isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(get(boardPath, observer).getBody().path("positions").size()).isZero();

        var report = Map.of("clientId", UUID.randomUUID(), "lat", 12.97, "lng", 77.6, "accuracy", 8,
                "note", "Test only");
        var receipts = race(() -> post(reportPath, owner, report), () -> post(reportPath, owner, report));
        assertThat(receipts).allSatisfy(receipt -> assertThat(receipt.getStatusCode()).isEqualTo(HttpStatus.OK));
        String reportId = receipts.getFirst().getBody().path("id").asText();
        assertThat(receipts.getLast().getBody().path("id").asText()).isEqualTo(reportId);
        var reports = get(boardPath, observer).getBody().path("reports");
        assertThat(reports.size()).isEqualTo(1);
        assertThat(reports.get(0).path("id").asText()).isEqualTo(reportId);
    }

    private String fieldToken() {
        var response = http.postForEntity("/api/field/access", Map.of("code", TEST_FIELD_CODE), JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().path("token").asText();
    }

    @Test
    void operatorObservationsRequireTheCorrectScopeAndPreserveFreshProvenance() {
        String boardPath = "/api/ops/board";
        String observationsPath = "/api/ops/observations";
        assertThat(http.getForEntity("/api/ops/status", JsonNode.class).getBody().path("available").asBoolean()).isTrue();
        assertThat(http.getForEntity(boardPath, JsonNode.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(get(boardPath, fieldToken()).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get(boardPath, token(UUID.randomUUID(), "COORDINATOR")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        var wrongAccount = http.postForEntity("/api/ops/access", Map.of("operator", "qa-flood", "code", DISPATCH_CODE), JsonNode.class);
        assertThat(wrongAccount.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        String flood = operatorToken("qa-flood", FLOOD_CODE);
        String dispatch = operatorToken("qa-dispatch", DISPATCH_CODE);
        assertThat(get("/api/field/board", flood).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/ops/traffic-feed", flood).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/ops/traffic-feed", operatorToken("qa-coordinator", COORDINATOR_CODE))
                .getBody().path("status").asText()).isEqualTo("not_configured");
        var board = get(boardPath, flood);
        assertThat(board.getHeaders().getCacheControl()).contains("no-store");
        assertThat(board.getBody().path("scope").asText()).isEqualTo("FLOOD");

        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        String site = "test-" + UUID.randomUUID();
        var observation = Map.of("kind", "FLOOD", "siteId", site, "label", "QA water depth site",
                "lat", 12.98, "lng", 77.60, "observedAt", now, "sourceRef", "qa-reading-1", "value", 24);
        assertThat(post(observationsPath, dispatch, observation).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        var saved = post(observationsPath, flood, observation);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(saved.getBody().path("reportedBy").asText()).isEqualTo("qa-flood");
        assertThat(Instant.parse(saved.getBody().path("expiresAt").asText())).isEqualTo(now.plus(Duration.ofMinutes(30)));
        assertThat(post(observationsPath, flood, observation).getBody()).isEqualTo(saved.getBody());

        String viewer = operatorToken("qa-viewer", VIEWER_CODE);
        assertThat(get(boardPath, viewer).getBody().path("observations").isEmpty()).isTrue();
        assertThat(get("/api/ops/traffic-feed", viewer).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post(observationsPath, viewer, observation).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        var older = new java.util.HashMap<String, Object>(observation);
        older.put("observedAt", now.minusSeconds(60));
        older.put("sourceRef", "qa-older-reading");
        assertThat(post(observationsPath, flood, older).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var matching = StreamSupport.stream(get(boardPath, flood).getBody().path("observations").spliterator(), false)
                .filter(row -> site.equals(row.path("siteId").asText())).toList();
        assertThat(matching).singleElement().satisfies(row -> {
            assertThat(row.path("sourceRef").asText()).isEqualTo("qa-reading-1");
            assertThat(row.path("value").asDouble()).isEqualTo(24);
        });
    }

    @Test
    void operatorHandoffRequiresDispatcherAndReplaysOrderedTransitions() throws Exception {
        String path = "/api/ops/handoffs";
        String flood = operatorToken("qa-flood", FLOOD_CODE);
        String dispatch = operatorToken("qa-dispatch", DISPATCH_CODE);
        String coordinator = operatorToken("qa-coordinator", COORDINATOR_CODE);
        UUID id = UUID.randomUUID();
        String reference = "QA-EXTERNAL-" + id;
        var relay = Map.of("id", id, "reference", reference, "state", "RELAYED");
        var acknowledge = Map.of("id", id, "reference", reference, "expectedState", "RELAYED", "state", "ACKNOWLEDGED");
        var close = Map.of("id", id, "reference", reference, "expectedState", "ACKNOWLEDGED", "state", "CLOSED");

        assertThat(post(path, flood, relay).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(post(path, dispatch, acknowledge).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(post(path, dispatch, relay).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post(path, dispatch, close).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var attempts = race(() -> post(path, dispatch, acknowledge), () -> post(path, coordinator, acknowledge));
        assertThat(attempts).allSatisfy(response -> assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK));
        assertThat(attempts.getFirst().getBody()).isEqualTo(attempts.getLast().getBody());
        assertThat(post(path, coordinator, close).getBody().path("state").asText()).isEqualTo("CLOSED");

        assertThat(get("/api/ops/board", flood).getBody().path("handoffs").isEmpty()).isTrue();
        var handoffs = get("/api/ops/board", dispatch).getBody().path("handoffs");
        assertThat(StreamSupport.stream(handoffs.spliterator(), false)
                .filter(row -> id.toString().equals(row.path("id").asText())).toList()).singleElement()
                .satisfies(row -> assertThat(row.path("state").asText()).isEqualTo("CLOSED"));
    }

    private String operatorToken(String operator, String code) {
        var access = http.postForEntity("/api/ops/access", Map.of("operator", operator, "code", code), JsonNode.class);
        assertThat(access.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(access.getHeaders().getCacheControl()).contains("no-store");
        return access.getBody().path("token").asText();
    }

    private static String sha256(String input) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    @Test
    void stompDeliversCommittedUpdatesAndRejectsOtherSessions() throws Exception {
        UUID session = UUID.randomUUID();
        String coordinator = token(session, "COORDINATOR");
        var inbox = new StompInbox();
        try (var client = HttpClient.newHttpClient()) {
            var socket = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                    .subprotocols("v12.stomp")
                    .buildAsync(URI.create("ws://localhost:" + port + "/ws"), inbox).get(5, TimeUnit.SECONDS);
            try {
                socket.sendText("CONNECT\naccept-version:1.2\nAuthorization:Bearer " + coordinator + "\n\n\0", true).join();
                assertThat(inbox.next()).startsWith("CONNECTED");
                String topic = "/topic/updates/" + session;

                socket.sendText("SUBSCRIBE\nid:1\ndestination:" + topic + "\n\n\0", true).join();
                await().atMost(Duration.ofSeconds(5))
                        .until(() -> !subscribers.findSubscriptions(subscription -> subscription.getDestination().equals(topic)).isEmpty());
                String incident = createIncident(coordinator);
                assertThat(inbox.next()).startsWith("MESSAGE").contains(topic, "SOS_REPORTED", incident);

                socket.sendText("SUBSCRIBE\nid:2\ndestination:/topic/updates/" + UUID.randomUUID() + "\n\n\0", true).join();
                assertThat(inbox.next()).startsWith("ERROR");
            } finally {
                socket.abort();
            }
        }
    }

    @Test
    void duplicateSosIsStoredAndAuditedOnceAndSessionCannotLeak() throws Exception {
        UUID session = UUID.randomUUID();
        String citizen = token(session, "CITIZEN");
        String coordinator = token(session, "COORDINATOR");
        var report = report(UUID.randomUUID());
        var outcomes = race(() -> post("/api/incidents", citizen, report), () -> post("/api/incidents", citizen, report));

        assertThat(outcomes).allSatisfy(outcome -> assertThat(outcome.getStatusCode()).isEqualTo(HttpStatus.OK));
        String id = outcomes.getFirst().getBody().get("id").asText();
        assertThat(outcomes.getLast().getBody().get("id").asText()).isEqualTo(id);
        assertThat(outcomes.getFirst().getBody().get("summary").asText()).isEqualTo("Flood rescue request");
        assertThat(get("/api/incidents/" + id + "/timeline", coordinator).getBody().size()).isEqualTo(1);
        assertThat(get("/api/incidents", citizen).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        String otherCoordinator = token(UUID.randomUUID(), "COORDINATOR");
        assertThat(get("/api/incidents/" + id + "/timeline", otherCoordinator).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void simultaneousDispatchCannotDoubleBookAndMissionReplayReleasesUnitOnce() throws Exception {
        UUID session = UUID.randomUUID();
        String coordinator = token(session, "COORDINATOR");
        String responder = token(session, "RESPONDER");
        String a = createIncident(coordinator);
        String b = createIncident(coordinator);
        var first = get("/api/incidents/" + a + "/recommendations", coordinator).getBody().get("candidates").get(0);
        String unit = first.get("unitId").asText();
        var firstPath = "/api/incidents/" + a + "/dispatch";
        var secondPath = "/api/incidents/" + b + "/dispatch";
        Map<String, String> assignment = Map.of("unitId", unit);

        var results = race(() -> post(firstPath, coordinator, assignment), () -> post(secondPath, coordinator, assignment));
        assertOneSuccessAndOneConflict(results);
        boolean firstWon = results.getFirst().getStatusCode().is2xxSuccessful();
        String mission = "/api/incidents/" + (firstWon ? a : b) + "/status";
        assertThat(post(mission, responder, action("ON_SCENE")).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        var departure = action("EN_ROUTE");
        assertThat(post(mission, responder, departure).getBody().get("status").asText()).isEqualTo("EN_ROUTE");
        assertThat(post(mission, responder, departure).getBody().get("status").asText()).isEqualTo("EN_ROUTE");
        assertThat(post(mission, responder, action("ON_SCENE")).getStatusCode()).isEqualTo(HttpStatus.OK);
        var resolution = action("RESOLVED");
        assertThat(post(mission, responder, resolution).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post(mission, responder, resolution).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(post(firstWon ? secondPath : firstPath, coordinator, assignment).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void shelterReservationsAndAdmissionKeepCapacityUnderConcurrentWrites() throws Exception {
        String manager = token(UUID.randomUUID(), "SHELTER");
        JsonNode shelter = get("/api/shelters", manager).getBody().get(0);
        String base = "/api/shelters/" + shelter.get("id").asText() + "/reservations";
        int available = shelter.get("available").asInt();
        var first = Map.of("clientId", UUID.randomUUID(), "people", available);
        var second = Map.of("clientId", UUID.randomUUID(), "people", available);
        var outcomes = race(() -> post(base, manager, first), () -> post(base, manager, second));
        assertOneSuccessAndOneConflict(outcomes);
        boolean firstWon = outcomes.getFirst().getStatusCode().is2xxSuccessful();
        String reservation = outcomes.get(firstWon ? 0 : 1).getBody().get("id").asText();
        assertThat(post(base, manager, firstWon ? first : second).getBody().get("id").asText()).isEqualTo(reservation);

        var admit = base + "/" + reservation + "/admit";
        assertThat(post(admit, manager, null).getBody().get("status").asText()).isEqualTo("ADMITTED");
        assertThat(post(admit, manager, null).getBody().get("status").asText()).isEqualTo("ADMITTED");
        var current = get("/api/shelters", manager).getBody().get(0);
        assertThat(current.get("reserved").asInt()).isZero();
        assertThat(current.get("admitted").asInt()).isEqualTo(shelter.get("capacity").asInt());
        assertThat(current.get("available").asInt()).isZero();
    }

    @Test
    void postgisFloodIntersectionReroutesAndSpatialGroupingPreservesBothReports() {
        String coordinator = token(UUID.randomUUID(), "COORDINATOR");
        String pair = "/api/routes?from=N06&to=N07";
        var dry = get(pair, coordinator).getBody();
        assertThat(dry.get("roadIds").get(0).asText()).isEqualTo("R05");
        var graph = post("/api/hazards", coordinator, Map.of("intensity", 40)).getBody();
        assertThat(graph.get("blockedRoadIds").get(0).asText()).isEqualTo("R05");
        var wet = get(pair, coordinator).getBody();
        assertThat(wet.get("reachable").asBoolean()).isTrue();
        assertThat(wet.get("roadIds").size()).isGreaterThan(1);
        assertThat(wet.get("distanceKm").asDouble()).isGreaterThan(dry.get("distanceKm").asDouble());

        String a = createIncident(coordinator);
        String b = createIncident(coordinator);
        var suggestions = get("/api/clusters", coordinator).getBody();
        assertThat(StreamSupport.stream(suggestions.spliterator(), false)
                .map(option -> option.get("incidentIds").toString()).toList())
                .anySatisfy(ids -> assertThat(ids).contains(a, b));
        var group = post("/api/clusters", coordinator, Map.of("incidentIds", List.of(a, b))).getBody().get("groupId");
        assertThat(StreamSupport.stream(get("/api/incidents", coordinator).getBody().spliterator(), false)
                .filter(incident -> incident.get("groupId").equals(group)).toList()).hasSize(2);
    }

    private String createIncident(String token) {
        return post("/api/incidents", token, report(UUID.randomUUID())).getBody().get("id").asText();
    }

    private Map<String, Object> report(UUID clientId) {
        return Map.of("clientId", clientId, "summary", "Synthetic flood incident text", "hazard", "FLOOD",
                "people", 3, "medical", false, "vulnerable", false, "depthCm", 65, "immediateDanger", false,
                "lat", 12.9778, "lng", 77.6122);
    }

    private Map<String, Object> action(String status) {
        return Map.of("clientId", UUID.randomUUID(), "status", status);
    }

    private String token(UUID session, String role) {
        var headers = new HttpHeaders();
        headers.set("X-Demo-Session", session.toString());
        var response = http.postForEntity("/api/auth/demo", new HttpEntity<>(Map.of("role", role), headers), JsonNode.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().get("token").asText();
    }

    private ResponseEntity<JsonNode> get(String path, String token) {
        return request(path, token, null, HttpMethod.GET);
    }

    private ResponseEntity<JsonNode> post(String path, String token, Object body) {
        return request(path, token, body, HttpMethod.POST);
    }

    private ResponseEntity<JsonNode> request(String path, String token, Object body, HttpMethod method) {
        var headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return http.exchange(path, method, new HttpEntity<>(body, headers), JsonNode.class);
    }

    private static void assertOneSuccessAndOneConflict(List<ResponseEntity<JsonNode>> results) {
        assertThat(results.stream().map(response -> response.getStatusCode().value()).toList())
                .containsExactlyInAnyOrder(200, 409);
    }

    private static final class StompInbox implements WebSocket.Listener {
        private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        private final StringBuilder fragments = new StringBuilder();

        @Override
        public java.util.concurrent.CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) {
                frames.add(fragments.toString());
                fragments.setLength(0);
            }
            socket.request(1);
            return null;
        }

        String next() throws InterruptedException {
            return frames.poll(5, TimeUnit.SECONDS);
        }
    }

    private static <T> List<T> race(Callable<T> first, Callable<T> second) throws Exception {
        try (var workers = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a = workers.submit(() -> { gate.await(); return first.call(); });
            var b = workers.submit(() -> { gate.await(); return second.call(); });
            gate.countDown();
            return List.of(a.get(15, TimeUnit.SECONDS), b.get(15, TimeUnit.SECONDS));
        }
    }
}
