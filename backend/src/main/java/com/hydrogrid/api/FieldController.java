package com.hydrogrid.api;

import com.hydrogrid.config.SecurityConfiguration;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/field")
class FieldController {
    private static final Duration SESSION_DURATION = Duration.ofHours(8);
    private final JdbcClient database;
    private final JwtEncoder encoder;
    private final String accessVersion;

    FieldController(JdbcClient database, JwtEncoder encoder, @Value("${hydrogrid.field-access-code}") String accessCode) {
        this.database = database;
        this.encoder = encoder;
        this.accessVersion = accessCode.length() >= 32 ? accessVersion(accessCode) : null;
    }

    @GetMapping("/status")
    Status status() {
        return new Status(accessVersion != null);
    }

    @PostMapping("/access")
    AccessToken access(@Valid @RequestBody AccessRequest request) {
        requireAvailable();
        if (!matchesVersion(accessVersion(request.code()))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer(SecurityConfiguration.TOKEN_ISSUER).subject(UUID.randomUUID().toString())
                .issuedAt(now).expiresAt(now.plus(SESSION_DURATION))
                .claim("role", "FIELD").claim("fieldVersion", accessVersion).build();
        return new AccessToken(encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue());
    }

    @GetMapping("/board")
    Board board(@AuthenticationPrincipal Jwt jwt) {
        UUID device = requireDevice(jwt);
        var positions = database.sql("""
                SELECT device_id, label, ST_Y(position) AS lat, ST_X(position) AS lng,
                       accuracy, seen_at
                FROM field_positions WHERE seen_at > now() - INTERVAL '5 minutes'
                ORDER BY seen_at DESC, device_id LIMIT 100
                """).query((rs, row) -> new Position(rs.getObject("device_id", UUID.class),
                rs.getString("label"), rs.getDouble("lat"), rs.getDouble("lng"),
                rs.getDouble("accuracy"), rs.getObject("seen_at", OffsetDateTime.class).toInstant())).list();
        var reports = database.sql("""
                SELECT id, ST_Y(position) AS lat, ST_X(position) AS lng, accuracy, note, created_at
                FROM field_reports WHERE created_at > now() - INTERVAL '24 hours'
                ORDER BY created_at DESC, id LIMIT 100
                """).query(Report.class).list();
        return new Board(device, positions, reports);
    }

    @PostMapping("/location")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void share(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LocationRequest request) {
        UUID device = requireDevice(jwt);
        validateLocation(request.lat(), request.lng(), request.accuracy());
        database.sql("""
                INSERT INTO field_positions (device_id, label, position, accuracy)
                VALUES (:device, :label, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :accuracy)
                ON CONFLICT (device_id) DO UPDATE SET label = EXCLUDED.label, position = EXCLUDED.position,
                    accuracy = EXCLUDED.accuracy, seen_at = EXCLUDED.seen_at
                """).param("device", device).param("label", request.label().strip())
                .param("lat", request.lat()).param("lng", request.lng()).param("accuracy", request.accuracy()).update();
    }

    @DeleteMapping("/location")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void stop(@AuthenticationPrincipal Jwt jwt) {
        database.sql("DELETE FROM field_positions WHERE device_id = :device")
                .param("device", requireDevice(jwt)).update();
    }

    @PostMapping("/reports")
    Report report(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReportRequest request) {
        UUID device = requireDevice(jwt);
        validateLocation(request.lat(), request.lng(), request.accuracy());
        return database.sql("""
                INSERT INTO field_reports (device_id, client_id, position, accuracy, note)
                VALUES (:device, :client, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :accuracy, :note)
                ON CONFLICT (device_id, client_id) DO UPDATE SET client_id = EXCLUDED.client_id
                RETURNING id, ST_Y(position) AS lat, ST_X(position) AS lng, accuracy, note, created_at
                """).param("device", device).param("client", request.clientId())
                .param("lat", request.lat()).param("lng", request.lng()).param("accuracy", request.accuracy())
                .param("note", request.note().strip()).query(Report.class).single();
    }

    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT15M")
    void expire() {
        database.sql("DELETE FROM field_positions WHERE seen_at <= now() - INTERVAL '5 minutes'").update();
        database.sql("DELETE FROM field_reports WHERE created_at <= now() - INTERVAL '24 hours'").update();
    }

    private void requireAvailable() {
        if (accessVersion == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private UUID requireDevice(Jwt jwt) {
        requireAvailable();
        if (!matchesVersion(jwt.getClaimAsString("fieldVersion"))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return UUID.fromString(jwt.getSubject());
    }

    private boolean matchesVersion(String candidate) {
        return candidate != null && MessageDigest.isEqual(accessVersion.getBytes(StandardCharsets.US_ASCII),
                candidate.getBytes(StandardCharsets.US_ASCII));
    }

    private static String accessVersion(String code) {
        try {
            // Rotating the code invalidates previously issued field sessions.
            byte[] value = MessageDigest.getInstance("SHA-256").digest(
                    ("hydrogrid-field-session:" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(value);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static void validateLocation(double lat, double lng, double accuracy) {
        if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && accuracy >= 0 && accuracy <= 100000)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid GPS fix");
        }
    }

    record Status(boolean available) {}
    record AccessRequest(@NotBlank @Size(max = 256) String code) {}
    record AccessToken(String token) {}
    record LocationRequest(@NotBlank @Size(max = 40) String label, @NotNull Double lat,
                           @NotNull Double lng, @NotNull Double accuracy) {}
    record ReportRequest(@NotNull UUID clientId, @NotNull Double lat, @NotNull Double lng,
                         @NotNull Double accuracy, @NotBlank @Size(max = 280) String note) {}
    record Position(UUID id, String label, double lat, double lng, double accuracy, Instant seenAt) {}
    record Report(UUID id, double lat, double lng, double accuracy, String note, OffsetDateTime createdAt) {}
    record Board(UUID deviceId, List<Position> positions, List<Report> reports) {}
}
