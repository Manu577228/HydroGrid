package com.hydrogrid.api;

import com.hydrogrid.config.FrontendOrigin;
import com.hydrogrid.config.SecurityConfiguration;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Semaphore;

@RestController
@RequestMapping("/api/account")
class AccountController {
    private static final String REFRESH_COOKIE = "hydrogrid-account-refresh";
    private static final String JSON = MediaType.APPLICATION_JSON_VALUE;
    private static final Duration ACCESS_DURATION = Duration.ofMinutes(10);
    private static final Duration RATE_WINDOW = Duration.ofMinutes(10);
    private static final Set<String> LOCAL_HOSTS = Set.of("127.0.0.1", "localhost", "[::1]", "::1");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<String> TIME_ZONES = ZoneId.getAvailableZoneIds();

    private final AccountStore accounts;
    private final PasswordEncoder passwords;
    private final JwtEncoder encoder;
    private final FrontendOrigin frontendOrigin;
    private final String missingAccountHash;
    private final Semaphore passwordWorkers = new Semaphore(2);
    private final Map<String, AttemptWindow> attempts = new HashMap<>();

    AccountController(AccountStore accounts, PasswordEncoder passwords, JwtEncoder encoder, FrontendOrigin frontendOrigin) {
        this.accounts = accounts;
        this.passwords = passwords;
        this.encoder = encoder;
        this.frontendOrigin = frontendOrigin;
        this.missingAccountHash = passwords.encode(newRefreshToken());
    }

    @PostMapping(value = "/register", consumes = JSON)
    ResponseEntity<AccountAccess> register(HttpServletRequest request, @Valid @RequestBody Register input,
                                           @CookieValue(value = REFRESH_COOKIE, required = false) String previous) {
        requireSameOrigin(request);
        limit("register:" + request.getRemoteAddr(), 5);
        passwordSize(input.password(), true);

        String refreshToken = newRefreshToken();
        String passwordHash;
        requirePasswordWorker();
        try {
            passwordHash = passwords.encode(input.password());
        } finally {
            passwordWorkers.release();
        }
        var session = accounts.register(normalizeEmail(input.email()), input.displayName().strip(), passwordHash, digest(refreshToken))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "This email already has an account"));
        revoke(previous);
        return access(request, session, refreshToken, HttpStatus.CREATED);
    }

    @PostMapping(value = "/login", consumes = JSON)
    ResponseEntity<AccountAccess> login(HttpServletRequest request, @Valid @RequestBody Login input,
                                        @CookieValue(value = REFRESH_COOKIE, required = false) String previous) {
        requireSameOrigin(request);
        limit("login-ip:" + request.getRemoteAddr(), 20);
        String email = normalizeEmail(input.email());
        limit("login-email:" + email, 8);
        passwordSize(input.password(), false);

        var credential = accounts.credential(email);
        requirePasswordWorker();
        try {
            String encoded = credential.map(AccountStore.Credential::passwordHash).orElse(missingAccountHash);
            if (!passwords.matches(input.password(), encoded) || credential.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Check your email and password");
            }
        } finally {
            passwordWorkers.release();
        }
        String refreshToken = newRefreshToken();
        var session = accounts.createSession(credential.orElseThrow().id(), digest(refreshToken));
        revoke(previous);
        return access(request, session, refreshToken, HttpStatus.OK);
    }

    @PostMapping(value = "/refresh", consumes = JSON)
    ResponseEntity<AccountAccess> refresh(HttpServletRequest request,
                                          @CookieValue(value = REFRESH_COOKIE, required = false) String previous) {
        requireSameOrigin(request);
        if (previous == null) return ResponseEntity.noContent().build();
        limit("refresh:" + request.getRemoteAddr(), 120);
        if (!validRefreshToken(previous)) throw invalidSession();

        String next = newRefreshToken();
        var session = accounts.rotate(digest(previous), digest(next)).orElseThrow(AccountController::invalidSession);
        return access(request, session, next, HttpStatus.OK);
    }

    @PostMapping(value = "/logout", consumes = JSON)
    ResponseEntity<Void> logout(HttpServletRequest request,
                                @CookieValue(value = REFRESH_COOKIE, required = false) String token) {
        requireSameOrigin(request);
        revoke(token);
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie(request, "", Duration.ZERO)).build();
    }

    @GetMapping("/profile")
    AccountStore.Profile profile(@AuthenticationPrincipal Jwt jwt) {
        return accounts.profile(accountId(jwt), sessionId(jwt)).orElseThrow(AccountController::invalidSession);
    }

    @PatchMapping(value = "/profile", consumes = JSON)
    AccountStore.Profile update(HttpServletRequest request, @AuthenticationPrincipal Jwt jwt,
                                @Valid @RequestBody Settings settings) {
        requireSameOrigin(request);
        if (!TIME_ZONES.contains(settings.timeZone())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid time zone");
        }
        return accounts.update(accountId(jwt), sessionId(jwt), settings.displayName().strip(), settings.timeZone())
                .orElseThrow(AccountController::invalidSession);
    }

    private ResponseEntity<AccountAccess> access(HttpServletRequest request, AccountStore.Session session,
                                                  String refreshToken, HttpStatus status) {
        var profile = accounts.profile(session.accountId(), session.id()).orElseThrow(AccountController::invalidSession);
        Instant now = Instant.now();
        Instant deadline = session.expiresAt().toInstant();
        Instant expiresAt = now.plus(ACCESS_DURATION);
        if (deadline.isBefore(expiresAt)) expiresAt = deadline;
        var claims = JwtClaimsSet.builder().issuer(SecurityConfiguration.TOKEN_ISSUER)
                .subject(session.accountId().toString()).claim("accountSession", session.id().toString())
                .claim("role", SecurityConfiguration.ACCOUNT_ROLE).issuedAt(now).expiresAt(expiresAt).build();
        var token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims));
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookie(request, refreshToken, Duration.between(now, deadline)))
                .body(new AccountAccess(token.getTokenValue(), expiresAt, profile));
    }

    private synchronized void limit(String key, int maximum) {
        Instant now = Instant.now();
        AttemptWindow window = attempts.get(key);
        if (window == null || !window.reset().isAfter(now)) {
            if (attempts.size() >= 8192) {
                attempts.values().removeIf(value -> !value.reset().isAfter(now));
                if (attempts.size() >= 8192) throw limited();
            }
            attempts.put(key, new AttemptWindow(1, now.plus(RATE_WINDOW)));
        } else {
            if (window.attempts() >= maximum) throw limited();
            attempts.put(key, new AttemptWindow(window.attempts() + 1, window.reset()));
        }
    }

    private void requirePasswordWorker() {
        if (!passwordWorkers.tryAcquire()) throw limited();
    }

    private void revoke(String token) {
        if (validRefreshToken(token)) accounts.revoke(digest(token));
    }

    private void requireSameOrigin(HttpServletRequest request) {
        var forbidden = new ResponseStatusException(HttpStatus.FORBIDDEN, "A secure same-origin request is required");
        String host = request.getServerName();
        if (!request.isSecure() && !LOCAL_HOSTS.contains(host.toLowerCase(Locale.ROOT))) throw forbidden;
        String fetchSite = request.getHeader("Sec-Fetch-Site");
        if (fetchSite != null && !"same-origin".equals(fetchSite)) throw forbidden;
        String rawOrigin = request.getHeader(HttpHeaders.ORIGIN);
        if (rawOrigin == null) throw forbidden;
        // An HTTPS frontend rewrite may preserve the browser origin and replace the request host.
        if (request.isSecure() && "same-origin".equals(fetchSite) && frontendOrigin.matches(rawOrigin)) return;
        try {
            var origin = URI.create(rawOrigin);
            int port = origin.getPort() >= 0 ? origin.getPort() : request.isSecure() ? 443 : 80;
            if (!request.getScheme().equalsIgnoreCase(origin.getScheme())
                    || !host.equalsIgnoreCase(origin.getHost()) || request.getServerPort() != port
                    || origin.getRawUserInfo() != null || origin.getRawQuery() != null || origin.getRawFragment() != null
                    || !origin.getRawPath().isEmpty()) throw forbidden;
        } catch (IllegalArgumentException invalid) {
            throw forbidden;
        }
    }

    private static String cookie(HttpServletRequest request, String value, Duration ttl) {
        return ResponseCookie.from(REFRESH_COOKIE, value).httpOnly(true).secure(request.isSecure())
                .sameSite("Strict").path("/api/account").maxAge(ttl).build().toString();
    }

    private static void passwordSize(String password, boolean checkMinimum) {
        if ((checkMinimum && password.codePointCount(0, password.length()) < 12)
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use 12 or more characters and at most 72 UTF-8 bytes");
        }
    }

    private static String normalizeEmail(String email) {
        String normalized = email.strip().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email address is too long");
        return normalized;
    }

    private static boolean validRefreshToken(String token) {
        return token != null && token.matches("[A-Za-z0-9_-]{43}");
    }

    private static String newRefreshToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] digest(String raw) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static UUID accountId(Jwt jwt) {
        return uuid(jwt.getSubject());
    }

    private static UUID sessionId(Jwt jwt) {
        return uuid(jwt.getClaimAsString("accountSession"));
    }

    private static UUID uuid(String value) {
        try {
            if (value != null) return UUID.fromString(value);
        } catch (IllegalArgumentException invalid) {
            throw invalidSession();
        }
        throw invalidSession();
    }

    private static ResponseStatusException limited() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many account requests. Try again later");
    }

    private static ResponseStatusException invalidSession() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in again to continue");
    }

    private record AttemptWindow(int attempts, Instant reset) {}

    public record Register(@NotBlank @Email @Size(max = 254) String email,
                           @NotBlank @Size(max = 80) String displayName,
                           @NotBlank @Size(max = 144) String password) {}
    public record Login(@NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 144) String password) {}
    public record Settings(@NotBlank @Size(max = 80) String displayName,
                           @NotBlank @Size(max = 64) String timeZone) {}
    public record AccountAccess(String token, Instant expiresAt, AccountStore.Profile profile) {}
}
