package com.hydrogrid;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CitizenAccountIntegrationTest {
    private static final String EMAIL = "qa-citizen@example.test";
    private static final String PASSWORD = "local-citizen-QA-password";

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

    @LocalServerPort
    int port;
    @Autowired
    ObjectMapper mapper;
    @Autowired
    org.springframework.jdbc.core.simple.JdbcClient database;

    @Test
    void accountSecurityAndLifecycle() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var registration = Map.of("email", EMAIL.toUpperCase(java.util.Locale.ROOT),
                    "displayName", "QA Citizen", "password", PASSWORD, "role", "OPS");

            assertThat(call(client, "GET", "/api/account/profile", null, null, null, null).statusCode()).isEqualTo(401);
            assertThat(call(client, "POST", "/api/account/register", registration, "https://other.example.test",
                    null, null).statusCode()).isEqualTo(403);

            var signedUp = call(client, "POST", "/api/account/register", registration, origin(), null, null);
            assertThat(signedUp.statusCode()).isEqualTo(201);
            var firstAccess = mapper.readTree(signedUp.body());
            assertThat(firstAccess.at("/profile/email").asText()).isEqualTo(EMAIL);
            assertThat(firstAccess.at("/profile/role").asText()).isEqualTo("CITIZEN");
            assertThat(signedUp.headers().firstValue("Cache-Control")).hasValueSatisfying(value ->
                    assertThat(value).contains("no-store"));
            String firstToken = firstAccess.path("token").asText();
            String firstCookie = refreshCookie(signedUp);
            String storedPassword = database.sql("SELECT password_hash FROM citizen_accounts WHERE email = :email")
                    .param("email", EMAIL).query(String.class).single();
            assertThat(storedPassword).startsWith("$2").doesNotContain(PASSWORD);

            for (String access : new String[]{"/api/incidents", "/api/ops/board", "/api/field/board"}) {
                assertThat(call(client, "GET", access, null, null, firstToken, null).statusCode()).isEqualTo(403);
            }

            var updated = call(client, "PATCH", "/api/account/profile",
                    Map.of("displayName", "Local QA Profile", "timeZone", "Europe/Stockholm"), origin(), firstToken, null);
            assertThat(updated.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(updated.body()).path("displayName").asText()).isEqualTo("Local QA Profile");
            assertThat(call(client, "PATCH", "/api/account/profile", Map.of("displayName", "QA", "timeZone", "wrong-zone"),
                    origin(), firstToken, null).statusCode()).isEqualTo(400);

            assertThat(call(client, "POST", "/api/account/refresh", Map.of(), "https://other.example.test",
                    null, firstCookie).statusCode()).isEqualTo(403);
            var refreshed = call(client, "POST", "/api/account/refresh", Map.of(), origin(), null, firstCookie);
            assertThat(refreshed.statusCode()).isEqualTo(200);
            String nextCookie = refreshCookie(refreshed);
            assertThat(nextCookie).isNotEqualTo(firstCookie);
            var replay = call(client, "POST", "/api/account/refresh", Map.of(), origin(), null, firstCookie);
            assertThat(replay.statusCode()).isEqualTo(401);
            assertThat(replay.headers().firstValue("Set-Cookie")).isEmpty();

            var loggedOut = call(client, "POST", "/api/account/logout", Map.of(), origin(), null, nextCookie);
            assertThat(loggedOut.statusCode()).isEqualTo(204);
            assertThat(loggedOut.headers().firstValue("Set-Cookie")).hasValueSatisfying(value ->
                    assertThat(value).contains("Max-Age=0"));
            assertThat(call(client, "GET", "/api/account/profile", null, null,
                    mapper.readTree(refreshed.body()).path("token").asText(), null).statusCode()).isEqualTo(401);
            assertThat(call(client, "GET", "/api/account/profile", null, null, firstToken, null).statusCode()).isEqualTo(401);
            assertThat(call(client, "POST", "/api/account/refresh", Map.of(), origin(), null, nextCookie).statusCode()).isEqualTo(401);

            var signIn = call(client, "POST", "/api/account/login", Map.of("email", EMAIL, "password", PASSWORD),
                    origin(), null, null);
            assertThat(signIn.statusCode()).isEqualTo(200);
            assertThat(profile(signIn).path("timeZone").asText()).isEqualTo("Europe/Stockholm");
            var incorrect = Map.of("email", EMAIL, "password", "incorrect-password");
            for (int attempt = 0; attempt < 7; attempt++) {
                assertThat(call(client, "POST", "/api/account/login", incorrect, origin(), null, null).statusCode())
                        .isEqualTo(401);
            }
            assertThat(call(client, "POST", "/api/account/login", incorrect, origin(), null, null).statusCode())
                    .isEqualTo(429);
        }
    }

    private JsonNode profile(HttpResponse<String> response) throws Exception {
        return mapper.readTree(response.body()).path("profile");
    }

    private static String refreshCookie(HttpResponse<String> response) {
        String header = response.headers().firstValue("Set-Cookie").orElseThrow();
        assertThat(header).contains("HttpOnly", "SameSite=Strict", "Path=/api/account");
        return header.split(";", 2)[0];
    }

    private HttpResponse<String> call(HttpClient client, String method, String path, Object body, String origin,
                                      String bearer, String cookie) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(origin() + path));
        if (origin != null) request.header("Origin", origin);
        if (bearer != null) request.header("Authorization", "Bearer " + bearer);
        if (cookie != null) request.header("Cookie", cookie);
        if (body == null) request.method(method, HttpRequest.BodyPublishers.noBody());
        else request.header("Content-Type", "application/json")
                .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String origin() {
        return "http://127.0.0.1:" + port;
    }
}
