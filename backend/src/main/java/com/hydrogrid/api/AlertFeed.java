package com.hydrogrid.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Element;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

import javax.net.ssl.HttpsURLConnection;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
class AlertFeed {
    private static final Logger LOG = LoggerFactory.getLogger(AlertFeed.class);
    private static final String SOURCE = "NDMA SACHET";
    private static final String SOURCE_URL = "https://sachet.ndma.gov.in/CapFeed";
    private static final String SCOPE = "Karnataka";
    private static final URI FEED_URL =
            URI.create("https://sachet.ndma.gov.in/cap_public_website/rss/rss_karnataka.xml");
    private static final String DETAIL_URL =
            "https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=";
    private static final int MAX_FEED_BYTES = 256_000;
    private static final Duration REFRESH_INTERVAL = Duration.ofMinutes(5);
    private static final Duration MAX_STALE_AGE = Duration.ofHours(24);

    private final Clock clock;
    private final FeedReader reader;
    private Instant refreshAfter = Instant.MIN;
    private Bulletins snapshot = response("unavailable", null, List.of());

    AlertFeed() {
        this(Clock.systemUTC(), AlertFeed::download);
    }

    AlertFeed(Clock clock, FeedReader reader) {
        this.clock = clock;
        this.reader = reader;
    }

    synchronized Bulletins bulletins() {
        Instant now = clock.instant();
        if (now.isBefore(refreshAfter)) {
            return snapshot;
        }
        try {
            List<Bulletin> items = parse(reader.read());
            snapshot = response("available", clock.instant(), items);
        } catch (IOException | SAXException | ParserConfigurationException error) {
            LOG.warn("Could not refresh Karnataka bulletins from NDMA SACHET: {}", error.getClass().getSimpleName());
            Instant checkedAt = snapshot.checkedAt();
            if (checkedAt != null && clock.instant().isBefore(checkedAt.plus(MAX_STALE_AGE))) {
                snapshot = response("stale", checkedAt, snapshot.items());
            } else {
                snapshot = response("unavailable", checkedAt, List.of());
            }
        }
        refreshAfter = clock.instant().plus(REFRESH_INTERVAL);
        if ("stale".equals(snapshot.status())) {
            Instant staleExpiry = snapshot.checkedAt().plus(MAX_STALE_AGE);
            if (staleExpiry.isBefore(refreshAfter)) refreshAfter = staleExpiry;
        }
        return snapshot;
    }

    private static byte[] download() throws IOException {
        var connection = (HttpsURLConnection) FEED_URL.toURL().openConnection();
        connection.setConnectTimeout(2_000);
        connection.setReadTimeout(3_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Accept", "application/rss+xml, application/xml");
        try {
            if (connection.getResponseCode() != 200) {
                throw new IOException("SACHET returned a non-200 status");
            }
            try (var input = connection.getInputStream()) {
                byte[] document = input.readNBytes(MAX_FEED_BYTES + 1);
                if (document.length > MAX_FEED_BYTES) {
                    throw new IOException("SACHET feed exceeded the response size limit");
                }
                return document;
            }
        } finally {
            connection.disconnect();
        }
    }

    static List<Bulletin> parse(byte[] document) throws IOException, ParserConfigurationException, SAXException {
        var factory = DocumentBuilderFactory.newDefaultInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        var parser = factory.newDocumentBuilder();
        parser.setErrorHandler(new DefaultHandler());
        var root = parser.parse(new ByteArrayInputStream(document)).getDocumentElement();
        var channels = root.getElementsByTagName("channel");
        if (!"rss".equals(root.getTagName()) || channels.getLength() != 1) {
            throw new IOException("Invalid SACHET RSS feed");
        }

        var rows = ((Element) channels.item(0)).getElementsByTagName("item");
        List<Bulletin> items = new ArrayList<>();
        for (int index = 0; index < rows.getLength(); index++) {
            var item = (Element) rows.item(index);
            String id = field(item, "guid");
            String title = field(item, "title");
            String date = field(item, "pubDate");
            if (title == null || date == null || id == null || !id.matches("[0-9]{1,32}")) {
                continue;
            }
            try {
                Instant publishedAt = ZonedDateTime.parse(date, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();
                items.add(new Bulletin(id, title, field(item, "category"), issuer(item),
                        publishedAt, DETAIL_URL + id));
            } catch (DateTimeParseException ignored) {
                // A bulletin without a valid date cannot be presented as a dated item.
            }
        }
        if (rows.getLength() > 0 && items.isEmpty()) {
            throw new IOException("SACHET entries contained no usable bulletins");
        }
        return items.stream()
                .sorted(Comparator.comparing(Bulletin::publishedAt).reversed())
                .distinct()
                .limit(10)
                .toList();
    }

    private static String field(Element item, String tag) {
        var entry = item.getElementsByTagName(tag).item(0);
        if (entry == null) return null;
        String value = entry.getTextContent().strip();
        return value.isEmpty() ? null : value;
    }

    private static String issuer(Element item) {
        String author = field(item, "author");
        if (author == null) return null;
        int opening = author.indexOf('(');
        int closing = author.lastIndexOf(')');
        if (opening >= 0 && closing > opening + 1) {
            return author.substring(opening + 1, closing).strip();
        }
        return author.contains("@") ? null : author;
    }

    private static Bulletins response(String status, Instant checkedAt, List<Bulletin> items) {
        return new Bulletins(SOURCE, SOURCE_URL, SCOPE, status, checkedAt, items);
    }

    @FunctionalInterface
    interface FeedReader {
        byte[] read() throws IOException;
    }

    record Bulletins(String source, String sourceUrl, String scope, String status, Instant checkedAt,
                     List<Bulletin> items) {}

    record Bulletin(String id, String title, String category, String issuer, Instant publishedAt, String officialUrl) {}
}
