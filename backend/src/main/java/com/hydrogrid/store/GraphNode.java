package com.hydrogrid.store;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.locationtech.jts.geom.Point;

@Entity
@Table(name = "graph_nodes")
class GraphNode {
    @Id
    String id;
    String label;

    @Column(columnDefinition = "geometry(Point,4326)", nullable = false)
    Point position;

    protected GraphNode() {}
}
