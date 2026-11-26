package com.hydrogrid.api;

import com.hydrogrid.config.SecurityConfiguration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Map;

@Service
class OpsAuthorizer {
    static final String OPERATOR_PATTERN = "[a-z0-9._-]{1,48}";
    private static final Duration SESSION_DURATION = Duration.ofHours(4);
    private static final byte[] NO_ACCOUNT = new byte[32];
    private final Map<String, Account> accounts;
    private final JwtEncoder encoder;

    OpsAuthorizer(JwtEncoder encoder, @Value("${hydrogrid.operator-accounts}") String configured) {
        this.encoder = encoder;
        this.accounts = parse(configured);
    }

    boolean available() {
        return !accounts.isEmpty();
    }

    String authenticate(String operator, String code) {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        Account account = accounts.get(operator);
        byte[] expected = account == null ? NO_ACCOUNT : account.codeHash();
        if (!MessageDigest.isEqual(expected, hash(code)) || account == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }

        Instant now = Instant.now();
        var claims = JwtClaimsSet.builder()
                .issuer(SecurityConfiguration.TOKEN_ISSUER).subject(operator)
                .issuedAt(now).expiresAt(now.plus(SESSION_DURATION))
                .claim("role", "OPS").claim("opsVersion", account.version()).build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }

    Operator authenticate(Jwt jwt) {
        Account account = accounts.get(jwt.getSubject());
        if (account == null || !account.version().equals(jwt.getClaimAsString("opsVersion"))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return new Operator(jwt.getSubject(), account.scope());
    }

    private static Map<String, Account> parse(String configured) {
        if (configured.isBlank()) return Map.of();
        var result = new HashMap<String, Account>();
        var seenHashes = new HashSet<String>();
        try {
            for (String entry : configured.split(",", -1)) {
                String[] fields = entry.strip().split(":", -1);
                if (fields.length != 3 || !fields[0].matches(OPERATOR_PATTERN) ||
                        !fields[2].matches("[A-Fa-f0-9]{64}") || result.containsKey(fields[0])) {
                    throw new IllegalArgumentException();
                }
                Scope scope = Scope.valueOf(fields[1]);
                byte[] codeHash = HexFormat.of().parseHex(fields[2]);
                String hexHash = HexFormat.of().formatHex(codeHash);
                if (!seenHashes.add(hexHash)) throw new IllegalArgumentException();
                String version = HexFormat.of().formatHex(hash("hydrogrid-ops:" + fields[0] + ":" + scope + ":" + hexHash));
                result.put(fields[0], new Account(codeHash, scope, version));
            }
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("HYDROGRID_OPERATOR_ACCOUNTS must define distinct named accounts, scopes, and SHA-256 code hashes");
        }
        return Map.copyOf(result);
    }

    private static byte[] hash(String text) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    enum Scope { FLOOD, TRAFFIC, SHELTER, DISPATCH, COORDINATOR, TRAFFIC_VIEWER }

    record Operator(String name, Scope scope) {
        boolean canWrite(Scope required) {
            return scope == Scope.COORDINATOR || scope == required;
        }

        boolean canReadTraffic() {
            return scope == Scope.TRAFFIC_VIEWER || canWrite(Scope.TRAFFIC);
        }
    }

    private record Account(byte[] codeHash, Scope scope, String version) {}
}
