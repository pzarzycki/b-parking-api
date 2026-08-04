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

export type WebSocketTicket = {
  ticket: string;
  expiresAt: string;
};

export type LiveEvent = {
  id: string;
  type: 'ready' | 'floor_plan.replaced' | 'parking.checked_in' | 'parking.checked_out' | 'spot.status_changed';
  occurredAt: string;
  data: Record<string, unknown>;
};

export type ParkingSpot = {
  id: string;
  floorId: string;
  bayId: string;
  number: string;
  status: 'available' | 'occupied';
  occupancySource?: 'vehicle' | 'manual' | null;
  manualReason?: string | null;
};

export type ParkingSpotPage = {
  items: ParkingSpot[];
  page: number;
  pageSize: number;
  total: number;
};

export type ParkingSession = {
  id: string;
  licensePlate: string;
  spotId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
};

export type ParkingSessionPage = {
  items: ParkingSession[];
  page: number;
  pageSize: number;
  total: number;
};

export type HistoryEventCounts = {
  checkIns: number;
  checkOuts: number;
  manualHolds: number;
  manualReleases: number;
};

export type OccupancyHistory = {
  asset: { type: 'bay' | 'spot'; id: string; floorId: string; bayId: string; name: string; capacity: number };
  from: string;
  to: string;
  granularity: 'hour' | 'day';
  summary: HistoryEventCounts & { averageOccupancy: number; peakOccupancy: number };
  points: Array<HistoryEventCounts & { startsAt: string; endsAt: string; occupancyPercent: number }>;
};

export type Point = { x: number; y: number };

export type PlanSpot = {
  id: string;
  label: string;
  kind: 'standard' | 'accessible' | 'ev';
  routeId: string;
  geometry: { x: number; y: number; width: number; height: number; rotation: number };
};

export type Polygon = { points: Point[] };
export type PlanBay = { id: string; name: string; geometry: Polygon; labelAt: Point; spots: PlanSpot[] };
export type PlanRoute = { id: string; kind: 'driveAisle' | 'way' | 'ramp'; direction: 'oneWay' | 'twoWay'; geometry: Polygon; centerline: Point[]; connectsTo: string[] };
export type PlanGate = { id: string; direction: 'inbound' | 'outbound'; opening: [Point, Point]; connectsTo: string };
export type PlanAmenity = { id: string; type: 'lift' | 'stairs' | 'column' | 'wall'; geometry: Polygon; label: string };

export type FloorPlanFloor = {
  id: string;
  level: number;
  name: string;
  canvas: { width: number; height: number };
  footprint: Polygon;
  routes: PlanRoute[];
  gates: PlanGate[];
  amenities: PlanAmenity[];
  bays: PlanBay[];
};

export type FloorPlan = {
  version: 1;
  garage: { id: string; name: string };
  floors: FloorPlanFloor[];
};
