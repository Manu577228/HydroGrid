package com.hydrogrid.api;

import com.hydrogrid.api.Models.DemoLogin;
import com.hydrogrid.api.Models.DemoToken;
import com.hydrogrid.config.SecurityConfiguration;
import com.hydrogrid.store.IncidentStore;
import com.hydrogrid.store.SessionStore;
import com.hydrogrid.store.SpatialGraph;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@RestController
class DemoController {
    private final JwtEncoder encoder;
    private final SessionStore sessions;
    private final SpatialGraph graph;
    private final IncidentStore incidents;
    private final boolean demoEnabled;

    DemoController(JwtEncoder encoder, SessionStore sessions, SpatialGraph graph, IncidentStore incidents,
                   @Value("${hydrogrid.demo-enabled}") boolean demoEnabled) {
        this.encoder = encoder;
        this.sessions = sessions;
        this.graph = graph;
        this.incidents = incidents;
        this.demoEnabled = demoEnabled;
    }

    @GetMapping("/api/health")
    ResponseEntity<Map<String, Object>> health() {
        try {
            if (graph.ready()) return ResponseEntity.ok(Map.of("status", "UP", "synthetic", incidents.synthetic()));
        } catch (DataAccessException ignored) {
            // Readiness fails while the database is unavailable.
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(
                Map.of("status", "DOWN", "synthetic", incidents.synthetic()));
    }

    @PostMapping("/api/auth/demo")
    DemoToken token(@RequestHeader("X-Demo-Session") UUID session, @RequestHeader("X-Demo-Owner") String owner,
                    @Valid @RequestBody DemoLogin login) {
        if (!demoEnabled) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Demo accounts are disabled");
        if (!owner.matches("[0-9a-f]{64}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid exercise workspace proof");
        }
        sessions.ensureSession(session, ownerHash(owner));
        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer(SecurityConfiguration.TOKEN_ISSUER).subject("demo-" + login.role().name().toLowerCase(java.util.Locale.ROOT))
                .issuedAt(now).expiresAt(now.plus(Duration.ofHours(2)))
                .claim("session", session.toString()).claim("demoOwned", true).claim("role", login.role().name()).build();
        var encoded = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims));
        return new DemoToken(encoded.getTokenValue(), login.role());
    }

    private static byte[] ownerHash(String owner) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(HexFormat.of().parseHex(owner));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
