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
import java.time.Duration;
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
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HydroGridIntegrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGIS = new PostgreSQLContainer<>(DockerImageName.parse(
            System.getProperty("hydrogrid.postgis.image", "postgis/postgis:16-3.5"))
            .asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGIS::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGIS::getUsername);
        registry.add("spring.datasource.password", POSTGIS::getPassword);
    }

    @Autowired
    TestRestTemplate http;

    @Autowired
    SimpUserRegistry subscribers;

    @LocalServerPort
    int port;

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
