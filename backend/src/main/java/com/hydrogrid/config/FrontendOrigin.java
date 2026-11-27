package com.hydrogrid.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Locale;

@Component
public final class FrontendOrigin {
    private final String origin;

    FrontendOrigin(@Value("${hydrogrid.frontend-origin}") String configured) {
        if (configured.isEmpty()) {
            origin = configured;
            return;
        }
        URI candidate = URI.create(configured);
        String host = candidate.getHost();
        if (host == null || !configured.equals("https://" + host.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("HYDROGRID_FRONTEND_ORIGIN must be an HTTPS origin with no port or path");
        }
        origin = configured;
    }

    String[] allowedOrigins() {
        return origin.isEmpty() ? new String[0] : new String[]{origin};
    }

    public boolean matches(String requestOrigin) {
        return !origin.isEmpty() && origin.equals(requestOrigin);
    }
}
