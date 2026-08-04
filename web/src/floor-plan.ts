import YAML from 'yaml';
import type { FloorPlan } from './types';

export function parseFloorPlan(yaml: string): FloorPlan {
  const value = YAML.parse(yaml) as FloorPlan;
  if (value?.version !== 1 || !value.garage?.id || !value.garage.name || !Array.isArray(value.floors) || value.floors.length === 0) throw new Error('This is not a valid version 1 garage floor plan.');
  for (const floor of value.floors) {
    if (!floor.id || !floor.canvas || !floor.footprint?.points || !Array.isArray(floor.routes) || !Array.isArray(floor.gates) || !Array.isArray(floor.amenities) || !Array.isArray(floor.bays)) throw new Error('The floor plan is missing required floor geometry.');
    for (const bay of floor.bays) if (!bay.geometry?.points || !bay.labelAt || !Array.isArray(bay.spots)) throw new Error('The floor plan is missing required bay geometry.');
  }
  return value;
}
