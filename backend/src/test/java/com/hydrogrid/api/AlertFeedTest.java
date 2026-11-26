package com.hydrogrid.api;

import org.junit.jupiter.api.Test;
import org.xml.sax.SAXException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AlertFeedTest {
    private static final Instant CHECKED_AT = Instant.parse("2026-11-27T00:00:00Z");
    private static final String RSS = """
            <rss version="2.0"><channel>
              <item>
                <title>Earlier bulletin</title><guid>123</guid>
                <pubDate>Wed, 25 Nov 2026 06:20:00 GMT</pubDate>
              </item>
              <item>
                <title>ಮಳೆಯ ಎಚ್ಚರಿಕೆ</title><guid>456</guid>
                <category>Met</category>
                <author>controlroom@ndma.gov.in (IMD Bengaluru)</author>
                <pubDate>Thu, 26 Nov 2026 10:34:00 GMT</pubDate>
                <link>https://example.com/untrusted</link>
              </item>
              <item><title>Bad date</title><guid>789</guid><pubDate>Invalid</pubDate></item>
            </channel></rss>
            """;

    @Test
    void parsesOfficialBulletinsInNewestFirstOrderAndConstrainsDetailLinks() throws Exception {
        var items = AlertFeed.parse(bytes(RSS));

        assertEquals(2, items.size());
        var newest = items.getFirst();
        assertEquals("456", newest.id());
        assertEquals("ಮಳೆಯ ಎಚ್ಚರಿಕೆ", newest.title());
        assertEquals("Met", newest.category());
        assertEquals("IMD Bengaluru", newest.issuer());
        assertEquals(Instant.parse("2026-11-26T10:34:00Z"), newest.publishedAt());
        assertEquals("https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=456", newest.officialUrl());
    }

    @Test
    void rejectsTheDoctypeAndTreatsAValidEmptyFeedAsAvailable() throws Exception {
        String invalid = """
                <!DOCTYPE rss [<!ENTITY external SYSTEM "file:///path/to/private.txt">]>
                <rss><channel><title>&external;</title></channel></rss>
                """;
        assertThrows(SAXException.class, () -> AlertFeed.parse(bytes(invalid)));
        assertTrue(AlertFeed.parse(bytes("<rss><channel><title>Official RSS</title></channel></rss>")).isEmpty());
    }

    @Test
    void cachesSuccessAndMarksOrDiscardsCachedBulletinsDuringAnOutage() {
        var clock = new AdjustableClock(CHECKED_AT);
        var requests = new AtomicInteger();
        var feed = new AlertFeed(clock, () -> {
            if (requests.incrementAndGet() == 1) return bytes(RSS);
            throw new IOException("source unavailable");
        });

        var available = feed.bulletins();
        assertEquals("available", available.status());
        assertEquals(CHECKED_AT, available.checkedAt());
        assertSame(available, feed.bulletins());
        assertEquals(1, requests.get());

        clock.now = CHECKED_AT.plus(5, ChronoUnit.MINUTES);
        var stale = feed.bulletins();
        assertEquals("stale", stale.status());
        assertEquals(CHECKED_AT, stale.checkedAt());
        assertEquals(available.items(), stale.items());
        assertSame(stale, feed.bulletins());
        assertEquals(2, requests.get());

        clock.now = CHECKED_AT.plus(24, ChronoUnit.HOURS);
        var unavailable = feed.bulletins();
        assertEquals("unavailable", unavailable.status());
        assertTrue(unavailable.items().isEmpty());
        assertEquals(3, requests.get());
    }

    private static byte[] bytes(String xml) {
        return xml.getBytes(StandardCharsets.UTF_8);
    }

    private static class AdjustableClock extends Clock {
        private Instant now;

        AdjustableClock(Instant now) {
            this.now = now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(now, zone);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
