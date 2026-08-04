export type Role = 'admin' | 'attendant';

export type User = {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Session = { token: string; user: User };

export type ParkingSpot = {
  id: string;
  floorId: string;
  bayId: string;
  number: string;
  status: 'available' | 'occupied';
  occupancySource?: 'vehicle' | 'manual' | null;
  manualReason?: string | null;
};

export type ParkingSession = {
  id: string;
  licensePlate: string;
  spotId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
};

export type Point = { x: number; y: number };

export type PlanFeature = {
  id: string;
  type: 'lane' | 'way' | 'wall' | 'gate';
  direction?: 'in' | 'out';
  points: Point[];
};

export type PlanSpot = {
  id: string;
  number: string;
  geometry: { x: number; y: number; width: number; height: number; orientation: number };
};

export type PlanBay = { id: string; name: string; spots: PlanSpot[] };

export type FloorPlanFloor = {
  id: string;
  level: number;
  name: string;
  canvas: { width: number; height: number };
  bays: PlanBay[];
  features: PlanFeature[];
};

export type FloorPlan = {
  version: 1;
  garage: { id: string; name: string };
  floors: FloorPlanFloor[];
};
