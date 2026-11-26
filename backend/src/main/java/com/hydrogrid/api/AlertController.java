package com.hydrogrid.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AlertController {
    private final AlertFeed feed;

    AlertController(AlertFeed feed) {
        this.feed = feed;
    }

    @GetMapping("/api/live/alerts")
    AlertFeed.Bulletins alerts() {
        return feed.bulletins();
    }
}
