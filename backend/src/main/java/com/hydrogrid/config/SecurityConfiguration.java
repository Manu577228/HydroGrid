package com.hydrogrid.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

@Configuration
@EnableMethodSecurity
public class SecurityConfiguration {
    public static final String TOKEN_ISSUER = "hydrogrid-demo";
    public static final String ACCOUNT_ROLE = "ACCOUNT_CITIZEN";

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        var grants = new JwtGrantedAuthoritiesConverter();
        grants.setAuthoritiesClaimName("role");
        grants.setAuthorityPrefix("ROLE_");
        var authentication = new JwtAuthenticationConverter();
        authentication.setJwtGrantedAuthoritiesConverter(grants);

        return http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sessions -> sessions.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(access -> access
                        .requestMatchers(HttpMethod.GET, "/api/health", "/api/graph", "/api/field/status", "/api/live/alerts", "/api/ops/status").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/demo", "/api/field/access", "/api/ops/access").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/account/register", "/api/account/login",
                                "/api/account/refresh", "/api/account/logout").permitAll()
                        .requestMatchers("/api/account/**").hasRole(ACCOUNT_ROLE)
                        .requestMatchers("/api/field/**").hasRole("FIELD")
                        .requestMatchers("/api/ops/**").hasRole("OPS")
                        .requestMatchers("/api/**").hasAnyRole("COORDINATOR", "RESPONDER", "SHELTER", "CITIZEN")
                        .requestMatchers(HttpMethod.GET, "/**").permitAll()
                        .requestMatchers(HttpMethod.HEAD, "/**").permitAll()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(authentication)))
                .build();
    }

    @Bean
    PasswordEncoder accountPasswordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    SecretKey hydroGridTokenKey(@Value("${hydrogrid.jwt-secret}") String configured) {
        byte[] key = configured.getBytes(StandardCharsets.UTF_8);
        if (configured.isBlank()) {
            key = new byte[32];
            new SecureRandom().nextBytes(key);
        }
        if (key.length < 32) {
            throw new IllegalArgumentException("HYDROGRID_JWT_SECRET must contain at least 32 UTF-8 bytes");
        }
        return new SecretKeySpec(key, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        var decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(TOKEN_ISSUER));
        return decoder;
    }
}
