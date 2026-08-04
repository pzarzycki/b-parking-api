---
sidebar_position: 3
---

# Floor plans

A floor plan is the garage's complete visual and structural definition. Admins upload it with `PUT /api/garage/floor-plan`; the API returns the stored YAML unchanged through `GET /api/garage/floor-plan` for visualization clients.

The repository's [example layout](https://github.com/pzarzycki/b-parking-api/blob/main/examples/garage-layout.yml) defines a ground floor (`ground`) and an upper floor (`upper`). The images below are generated from that same file.

## Layout hierarchy

```yaml
version: 2
garage: { id: downtown-garage, name: Downtown Garage, units: metres }
floors:
  - id: ground
    level: 0
    name: Ground floor
    canvas: { width: 120, height: 80 }
    footprint:
      points: [{ x: 4, y: 5 }, { x: 116, y: 5 }, { x: 116, y: 75 }, { x: 4, y: 75 }]
    routes:
      - id: ground-loop
        kind: driveAisle
        direction: oneWay
        geometry:
          points: [{ x: 7, y: 30 }, { x: 113, y: 30 }, { x: 113, y: 53 }, { x: 7, y: 53 }]
        centerline: [{ x: 8, y: 41 }, { x: 112, y: 41 }]
    bays:
      - id: north-a
        name: NORTH A
        geometry:
          points: [{ x: 8, y: 8 }, { x: 48, y: 8 }, { x: 48, y: 29 }, { x: 8, y: 29 }]
        labelAt: { x: 9, y: 11 }
        spots:
          - id: G-A01
            label: A01
            kind: standard
            routeId: ground-loop
            geometry: { x: 12, y: 14, width: 5, height: 10, rotation: 0 }
```

Each document has one garage and one or more floors. A floor contains its drawing canvas and footprint, routes, gates, amenities, bays, and parking spots. IDs are stable, globally unique identifiers. Each spot has a visible `label`, a `kind` (`standard`, `accessible`, or `ev`), and the route it connects to.

## Example: ground floor

![Generated illustration of the example layout's ground floor](/img/floor-plans/garage-layout-ground.svg)

The ground floor is level `0`, so it includes two inbound and two outbound gates. The example has four bays, one-way and two-way routes, a ramp, accessible spaces, EV spaces, a lift, and stairs.

## Example: upper floor

![Generated illustration of the example layout's upper floor](/img/floor-plans/garage-layout-upper.svg)

Upper floors use the same canvas, footprint, bay, and spot model. The ramp supplies the route between levels; gates are intentionally excluded because they are permitted only on level `0`.

## Geometry and validation rules

- A canvas must have positive dimensions. Footprints, bays, routes, and amenities use non-degenerate polygons; each route also has a centreline.
- Spot geometry uses positive dimensions and a clockwise `rotation` from `0` up to (but excluding) `360`. Its centre must be inside its bay and its `routeId` must name a route on the same floor.
- Gates are ground-floor only, connect to an existing route, and use two opening points. A ground floor requires exactly two inbound and two outbound gates.
- The renderer rejects malformed YAML, duplicate IDs, invalid polygons, invalid route references, invalid geometry, and invalid gate relationships.

Use the [API reference](api-reference) for the complete upload request, response, and error contract.
