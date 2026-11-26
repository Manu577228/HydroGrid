package com.hydrogrid.api;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
class TrafficFeedController {
    private final TrafficFeed feed;
    private final OpsAuthorizer authorizer;

    TrafficFeedController(TrafficFeed feed, OpsAuthorizer authorizer) {
        this.feed = feed;
        this.authorizer = authorizer;
    }

    @GetMapping("/api/ops/traffic-feed")
    TrafficFeed.Snapshot events(@AuthenticationPrincipal Jwt jwt) {
        if (!authorizer.authenticate(jwt).canReadTraffic()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return feed.events();
    }
}
