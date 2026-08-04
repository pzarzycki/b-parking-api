import YAML from 'yaml';
import type { FloorPlan, Point } from './types';

type RichSpot = { id: string; label: string; geometry: { x: number; y: number; width: number; height: number; rotation: number } };
type RichPlan = {
  version: 1;
  garage: { id: string; name: string; units: 'metres' };
  floors: Array<{
    id: string; level: number; name: string; canvas: { width: number; height: number }; footprint: { points: Point[] };
    routes: Array<{ id: string; kind: 'driveAisle' | 'way' | 'ramp'; centerline: Point[] }>;
    gates: Array<{ id: string; direction: 'inbound' | 'outbound'; opening: Point[] }>;
    bays: Array<{ id: string; name: string; spots: RichSpot[] }>;
  }>;
};

export function parseFloorPlan(yaml: string): FloorPlan {
  const value = YAML.parse(yaml) as RichPlan;
  if (value?.version !== 1 || !value.garage?.name || !Array.isArray(value.floors) || value.floors.length === 0) throw new Error('This is not a valid version 1 garage floor plan.');
  try {
    return {
      version: 1,
      garage: { id: value.garage.id, name: value.garage.name },
      floors: value.floors.map((floor) => ({
        id: floor.id,
        level: floor.level,
        name: floor.name,
        canvas: floor.canvas,
        features: [
          { id: `${floor.id}-footprint`, type: 'wall' as const, points: [...floor.footprint.points, floor.footprint.points[0]] },
          ...floor.routes.map((route) => ({ id: route.id, type: route.kind === 'driveAisle' ? ('lane' as const) : ('way' as const), points: route.centerline })),
          ...floor.gates.map((gate) => ({ id: gate.id, type: 'gate' as const, direction: gate.direction === 'inbound' ? ('in' as const) : ('out' as const), points: gate.opening }))
        ],
        bays: floor.bays.map((bay) => ({ id: bay.id, name: bay.name, spots: bay.spots.map((spot) => ({ id: spot.id, number: spot.label, geometry: { ...spot.geometry, orientation: spot.geometry.rotation } })) }))
      }))
    };
  } catch {
    throw new Error('The floor plan is missing required geometry or parking-space information.');
  }
}
