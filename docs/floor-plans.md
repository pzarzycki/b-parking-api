---
sidebar_position: 3
---

# Floor plans

A floor plan is the garage's complete visual and structural definition. Admins upload it with `PUT /api/garage/floor-plan`; the API returns the stored YAML unchanged through `GET /api/garage/floor-plan` for visualization clients.

The repository's [example layout](https://github.com/pzarzycki/b-parking-api/blob/main/examples/garage-layout.yml) is the schema-valid local Compose seed. It defines a ground floor (`ground`) and an upper floor (`upper`). The images below are generated from that same file by [`scripts/render-floor-plan.ts`](https://github.com/pzarzycki/b-parking-api/blob/main/scripts/render-floor-plan.ts).

## Complete example

[Download the complete `garage-layout.yml`](/examples/garage-layout.yml), copied from `examples/garage-layout.yml` when the documentation site is prepared. Use it as a complete starting point for an upload, then adjust its garage, floors, routes, gates, amenities, bays, and spaces for your facility.

## Layout hierarchy

```yaml
version: 1
garage: { id: downtown-garage, name: Downtown Garage, units: metres }
floors:
  - id: ground
    level: 0
    name: Ground floor
    canvas: { width: 120, height: 80 }
    footprint: { points: [{ x: 4, y: 5 }, { x: 116, y: 5 }, { x: 116, y: 75 }, { x: 4, y: 75 }] }
    routes:
      - { id: ground-main, kind: driveAisle, direction: oneWay, geometry: { points: [{ x: 7, y: 31 }, { x: 113, y: 31 }, { x: 113, y: 49 }, { x: 7, y: 49 }] }, centerline: [{ x: 8, y: 40 }, { x: 112, y: 40 }], connectsTo: [ground-ramp] }
    gates: []
    amenities: []
    bays:
      - id: ground-north
        name: North Bay
        geometry: { points: [{ x: 8, y: 8 }, { x: 48, y: 8 }, { x: 48, y: 29 }, { x: 8, y: 29 }] }
        labelAt: { x: 10, y: 12 }
        spots:
          - { id: G-A01, label: A01, kind: standard, routeId: ground-main, geometry: { x: 12, y: 15, width: 5, height: 10, rotation: 0 } }
```

Each document has one garage and one or more floors. A floor contains a drawing canvas and footprint, routes, gates, amenities, bays, and spaces. IDs are stable, globally unique identifiers. Every space has a visible `label`, a `kind` (`standard`, `accessible`, or `ev`), and a route reference. Parking-space geometry uses a clockwise `rotation` in degrees.

## Example: ground floor

![Generated illustration of the example layout's ground floor](/img/floor-plans/garage-layout-ground.svg)

This SVG is generated with `npm run floor-plan:render -- examples/garage-layout.yml --floor ground`.

The example ground floor has four gates, two bays, a one-way drive aisle, a two-way ramp, a lift, and stairs.

## Example: upper floor

![Generated illustration of the example layout's upper floor](/img/floor-plans/garage-layout-upper.svg)

This SVG is generated with `npm run floor-plan:render -- examples/garage-layout.yml --floor upper`.

The upper floor has two bays, a two-way drive aisle and ramp, and a lift. Its empty `gates` collection separates internal circulation from garage access.

## Geometry and validation rules

- Canvas dimensions and parking-space dimensions must be positive. Spot coordinates are non-negative and must fit within their floor's canvas.
- IDs start with a letter and are unique across the document. Floor levels are non-negative integers.
- Routes have a non-degenerate polygon, a centreline, a direction, and a route kind. Gates use a two-point opening, identify an inbound or outbound direction, and are permitted only on level `0`.
- The renderer rejects malformed YAML, duplicate IDs, invalid geometry, out-of-bounds points or spaces, unknown route references, and spaces or bay labels outside their bay polygon.

Use the [API reference](/api-reference) for the complete upload request, response, and error contract.
