import { describe, expect, it } from 'vitest';
import { parseFloorPlan } from './floor-plan';

const yaml = `version: 1
garage: { id: demo, name: Demo Garage, units: metres }
floors:
  - id: ground
    level: 0
    name: Ground
    canvas: { width: 100, height: 60 }
    footprint: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }] }
    routes:
      - { id: main, kind: driveAisle, direction: oneWay, geometry: { points: [{ x: 0, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 30 }] }, centerline: [{ x: 0, y: 25 }, { x: 100, y: 25 }], connectsTo: [] }
    gates:
      - { id: entry, direction: inbound, opening: [{ x: 10, y: 60 }, { x: 20, y: 60 }], connectsTo: main }
    amenities: []
    bays:
      - id: a
        name: A
        geometry: { points: [{ x: 5, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 18 }] }
        labelAt: { x: 7, y: 8 }
        spots:
          - { id: A01, label: A01, kind: standard, routeId: main, geometry: { x: 10, y: 10, width: 5, height: 8, rotation: 90 } }
`;

describe('parseFloorPlan', () => {
  it('normalizes the canonical visual layout for the interactive SVG', () => {
    const plan = parseFloorPlan(yaml);
    expect(plan.garage.name).toBe('Demo Garage');
    expect(plan.floors[0].features.map((feature) => feature.type)).toEqual(['wall', 'lane', 'gate']);
    expect(plan.floors[0].bays[0].spots[0]).toMatchObject({ id: 'A01', number: 'A01', geometry: { orientation: 90 } });
  });

  it('rejects non-version-1 documents', () => {
    expect(() => parseFloorPlan('version: 2\ngarage: {}\nfloors: []')).toThrow('valid version 1');
  });
});
