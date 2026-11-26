package com.hydrogrid.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TrafficFeedTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant NOW = Instant.parse("2026-11-27T09:00:00Z");
    private static final Instant SINCE = NOW.minus(Duration.ofHours(2));
    private static final String REPORT = """
            {"results":[
              {"reportID":"1684","eventTitle":"water_logging","roadClosure":true,"resolutionStatus":"open",
               "observationDateTime":"2026-11-27T12:50:00+05:30","modifiedDateTime":"2026-11-27T13:00:00+05:30"},
              {"reportID":"1684","eventTitle":"water_logging","roadClosure":false,"resolutionStatus":"closed",
               "observationDateTime":"2026-11-27T12:50:00+05:30","modifiedDateTime":"2026-11-27T13:25:00+05:30",
               "endDateTime":"2026-11-27T13:24:00+05:30"},
              {"reportID":"archived","eventTitle":"vehicle_breakdown","roadClosure":true,
               "observationDateTime":"2024-02-19T05:20:15+05:30"}
            ]}
            """;

    @Test
    void latestPoliceRevisionSupersedesClosureFlagAndArchivedSampleDoesNotAppear() throws Exception {
        assertThat(TrafficFeed.parse(JSON.readTree(REPORT), SINCE, NOW)).singleElement().satisfies(report -> {
            assertThat(report.id()).isEqualTo("1684");
            assertThat(report.roadClosure()).isFalse();
            assertThat(report.resolution()).isEqualTo("closed");
            assertThat(report.observedAt()).isEqualTo("2026-11-27T07:20:00Z");
            assertThat(report.endsAt()).isEqualTo("2026-11-27T07:54:00Z");
        });
        assertThat(TrafficFeed.parse(JSON.readTree("{\"results\":[]}"), SINCE, NOW)).isEmpty();
        assertThatThrownBy(() -> TrafficFeed.parse(JSON.readTree("{\"results\":[{\"roadClosure\":\"true\"}]}"), SINCE, NOW))
                .isInstanceOf(IOException.class);
    }

    @Test
    void disabledConnectorMakesNoRequestsAndLastSuccessExpiresAfterAnOutage() {
        var clock = new MutableClock();
        assertThat(new TrafficFeed(clock, null).events().status()).isEqualTo("not_configured");
        var calls = new AtomicInteger();
        var feed = new TrafficFeed(clock, (since, now) -> {
            if (calls.incrementAndGet() > 1) throw new IOException("upstream unavailable");
            return JSON.readTree(REPORT);
        });

        assertThat(feed.events().status()).isEqualTo("available");
        assertThat(feed.events().events()).hasSize(1);
        assertThat(calls.get()).isEqualTo(1);
        clock.now = NOW.plus(Duration.ofMinutes(6));
        var stale = feed.events();
        assertThat(stale.status()).isEqualTo("stale");
        assertThat(stale.checkedAt()).isEqualTo(NOW);
        assertThat(stale.events()).hasSize(1);

        clock.now = NOW.plus(Duration.ofMinutes(31));
        assertThat(feed.events().status()).isEqualTo("unavailable");
        assertThat(feed.events().events()).isEmpty();
    }

    private static final class MutableClock extends Clock {
        private Instant now = NOW;

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
