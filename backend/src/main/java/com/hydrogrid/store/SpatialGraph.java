package com.hydrogrid.store;

import com.hydrogrid.api.Models.Graph;
import com.hydrogrid.engine.HydroEngine;
import com.hydrogrid.engine.HydroEngine.Location;
import com.hydrogrid.engine.HydroEngine.Node;
import jakarta.persistence.EntityManager;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class SpatialGraph implements ApplicationRunner {
    private final HydroEngine engine = new HydroEngine();
    private final HydroEngine.Graph graph = engine.graph();
    private final Map<String, Node> nodes = graph.nodes().stream()
            .collect(Collectors.toUnmodifiableMap(Node::id, Function.identity()));
    private final JdbcClient db;
    private final EntityManager entities;

    public SpatialGraph(JdbcClient db, EntityManager entities) {
        this.db = db;
        this.entities = entities;
    }

    public HydroEngine engine() {
        return engine;
    }

    public Node node(String id) {
        return nodes.get(id);
    }

    public GraphNode nearest(double lat, double lng) {
        return (GraphNode) entities.createNativeQuery("""
                SELECT * FROM graph_nodes
                ORDER BY position::geography <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, id
                LIMIT 1
                """, GraphNode.class)
                .setParameter("lng", lng).setParameter("lat", lat)
                .getSingleResult();
    }

    public Graph snapshot(int intensity) {
        var active = engine.activeFloodZones(intensity);
        return new Graph(graph.nodes(), graph.roads(), active, graph.floodZones(),
                blockedRoads(active.stream().map(HydroEngine.FloodZone::id).toList()), intensity);
    }

    private Set<String> blockedRoads(Collection<String> zoneIds) {
        if (zoneIds.isEmpty()) return Set.of();
        return new LinkedHashSet<>(db.sql("""
                SELECT DISTINCT r.id FROM graph_roads r JOIN graph_flood_zones f
                    ON ST_Intersects(r.path, f.footprint)
                WHERE f.id IN (:ids) ORDER BY r.id
                """).param("ids", zoneIds).query(String.class).list());
    }

    public boolean ready() {
        return db.sql("SELECT COUNT(*) FROM graph_nodes").query(Integer.class).single() == nodes.size();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var geometry = new GeometryFactory(new PrecisionModel(), 4326);
        for (Node node : graph.nodes()) {
            var point = geometry.createPoint(new Coordinate(node.lng(), node.lat()));
            db.sql("""
                    INSERT INTO graph_nodes(id, label, position)
                    VALUES (:id, :label, ST_GeomFromText(:wkt, 4326))
                    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, position = EXCLUDED.position
                    """).param("id", node.id()).param("label", node.label()).param("wkt", point.toText()).update();
        }
        for (var road : graph.roads()) {
            var start = nodes.get(road.from());
            var end = nodes.get(road.to());
            var path = geometry.createLineString(new Coordinate[]{
                    new Coordinate(start.lng(), start.lat()), new Coordinate(end.lng(), end.lat())
            });
            db.sql("""
                    INSERT INTO graph_roads(id, path) VALUES (:id, ST_GeomFromText(:wkt, 4326))
                    ON CONFLICT (id) DO UPDATE SET path = EXCLUDED.path
                    """).param("id", road.id()).param("wkt", path.toText()).update();
        }
        for (var zone : graph.floodZones()) {
            var coordinates = new ArrayList<>(zone.polygon().stream().map(SpatialGraph::coordinate).toList());
            if (!coordinates.getFirst().equals2D(coordinates.getLast())) coordinates.add(coordinates.getFirst());
            var footprint = geometry.createPolygon(coordinates.toArray(Coordinate[]::new));
            db.sql("""
                    INSERT INTO graph_flood_zones(id, footprint) VALUES (:id, ST_GeomFromText(:wkt, 4326))
                    ON CONFLICT (id) DO UPDATE SET footprint = EXCLUDED.footprint
                    """).param("id", zone.id()).param("wkt", footprint.toText()).update();
        }
    }

    private static Coordinate coordinate(Location location) {
        return new Coordinate(location.lng(), location.lat());
    }
}
