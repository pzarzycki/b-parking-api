import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';

type Point = { x: number; y: number };
type Polygon = { points: Point[] };
type Spot = { id: string; label: string; kind: 'standard' | 'accessible' | 'ev'; geometry: { x: number; y: number; width: number; height: number; rotation: number }; routeId: string };
type Bay = { id: string; name: string; geometry: Polygon; labelAt: Point; spots: Spot[] };
type Route = { id: string; kind: 'driveAisle' | 'way' | 'ramp'; direction: 'oneWay' | 'twoWay'; geometry: Polygon; centerline: Point[]; connectsTo: string[] };
type Gate = { id: string; direction: 'inbound' | 'outbound'; opening: [Point, Point]; connectsTo: string };
type Amenity = { id: string; type: 'lift' | 'stairs' | 'column' | 'wall'; geometry: Polygon; label: string };
type Floor = { id: string; level: number; name: string; canvas: { width: number; height: number }; footprint: Polygon; bays: Bay[]; routes: Route[]; gates: Gate[]; amenities: Amenity[] };
type Plan = { version: 1; garage: { id: string; name: string; units: 'metres' }; floors: Floor[] };

const args = process.argv.slice(2);
const valueAfter = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const input = args.find((value, index) => !value.startsWith('--') && !['--floor', '--output'].includes(args[index - 1]));
if (!input) throw new Error('Usage: tsx scripts/render-floor-plan.ts <plan.yml> [--floor <id>] [--output <file.svg>] [--check]');

const raw = await readFile(resolve(input), 'utf8');
const document = YAML.parseDocument(raw, { prettyErrors: true, uniqueKeys: true });
if (document.errors.length || document.warnings.length) throw new Error([...document.errors, ...document.warnings].map(String).join('\n'));
const plan = document.toJS() as Plan;
const schema = JSON.parse(await readFile(new URL('../specs/floor-plan.schema.json', import.meta.url), 'utf8'));
const validateSchema = new (Ajv2020 as unknown as { new (options: object): { compile(value: object): { (value: unknown): boolean; errors?: Array<{ instancePath: string; message?: string }> } } })({ allErrors: true, strict: false }).compile(schema);
if (!validateSchema(plan)) throw new Error(validateSchema.errors?.map((error: { instancePath: string; message?: string }) => `${error.instancePath || '/'} ${error.message}`).join('\n'));

const errors: string[] = [];
const ids = new Set<string>();
const claim = (id: string, label: string) => {
  if (ids.has(id)) errors.push(`duplicate ${label}: ${id}`);
  ids.add(id);
};
const isPoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
const area = (points: Point[]) => Math.abs(points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);
const contains = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
const assertPolygon = (polygon: Polygon, label: string, floor: Floor) => {
  if (polygon.points.some((point) => !isPoint(point)) || area(polygon.points) === 0) errors.push(`${label}: needs a non-degenerate polygon`);
  if (polygon.points.some((point) => point.x < 0 || point.y < 0 || point.x > floor.canvas.width || point.y > floor.canvas.height)) errors.push(`${label}: point is outside ${floor.id}`);
};

for (const floor of plan.floors) {
  claim(floor.id, 'floor ID');
  assertPolygon(floor.footprint, floor.id, floor);
  const routeIds = new Set(floor.routes.map((route) => route.id));
  for (const route of floor.routes) {
    claim(route.id, 'route ID');
    assertPolygon(route.geometry, route.id, floor);
    if (route.centerline.some((point) => !isPoint(point)) || route.centerline.length < 2) errors.push(`${route.id}: invalid centreline`);
  }
  for (const gate of floor.gates) {
    claim(gate.id, 'gate ID');
    if (floor.level !== 0) errors.push(`${gate.id}: gates are permitted only on level 0`);
    if (!routeIds.has(gate.connectsTo)) errors.push(`${gate.id}: unknown route ${gate.connectsTo}`);
    if (gate.opening.some((point) => !isPoint(point))) errors.push(`${gate.id}: invalid opening`);
  }
  for (const amenity of floor.amenities) {
    claim(amenity.id, 'amenity ID');
    assertPolygon(amenity.geometry, amenity.id, floor);
  }
  for (const bay of floor.bays) {
    claim(bay.id, 'bay ID');
    assertPolygon(bay.geometry, bay.id, floor);
    if (!contains(bay.labelAt, bay.geometry.points)) errors.push(`${bay.id}: label must be inside its bay`);
    for (const spot of bay.spots) {
      claim(spot.id, 'spot ID');
      const { x, y, width, height } = spot.geometry;
      if (!routeIds.has(spot.routeId)) errors.push(`${spot.id}: unknown route ${spot.routeId}`);
      if (x < 0 || y < 0 || x + width > floor.canvas.width || y + height > floor.canvas.height) errors.push(`${spot.id}: geometry is outside ${floor.id}`);
      if (!contains({ x: x + width / 2, y: y + height / 2 }, bay.geometry.points)) errors.push(`${spot.id}: centre is outside ${bay.id}`);
    }
  }
}
if (errors.length) throw new Error(errors.join('\n'));
if (args.includes('--check')) {
  console.log(JSON.stringify({ garage: plan.garage.id, floors: plan.floors.length, spots: plan.floors.flatMap((floor) => floor.bays.flatMap((bay) => bay.spots)).length }));
  process.exit(0);
}

const floorId = valueAfter('--floor') ?? plan.floors[0].id;
const floor = plan.floors.find((item) => item.id === floorId);
if (!floor) throw new Error(`Unknown floor: ${floorId}`);
const esc = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const points = (items: Point[]) => items.map(({ x, y }) => `${x},${y}`).join(' ');
const polygon = (shape: Polygon, className: string) => `<polygon class="${className}" points="${points(shape.points)}"/>`;
const routes = floor.routes.map((route) => `${polygon(route.geometry, `route ${route.kind}`)}<polyline class="centreline ${route.direction}" points="${points(route.centerline)}"/>`).join('');
const bays = floor.bays.map((bay) => `${polygon(bay.geometry, 'bay')}<text class="bay-label" x="${bay.labelAt.x}" y="${bay.labelAt.y}">${esc(bay.name)}</text>`).join('');
const amenities = floor.amenities.map((amenity) => `${polygon(amenity.geometry, `amenity ${amenity.type}`)}<text class="amenity-label" x="${amenity.geometry.points[0].x + 1}" y="${amenity.geometry.points[0].y + 2}">${esc(amenity.label)}</text>`).join('');
const spots = floor.bays.flatMap((bay) => bay.spots).map((spot) => {
  const geometry = spot.geometry;
  const cx = geometry.x + geometry.width / 2;
  const cy = geometry.y + geometry.height / 2;
  return `<g transform="rotate(${geometry.rotation} ${cx} ${cy})"><rect class="spot available" x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" rx="0.45"/><text class="spot-label" x="${cx}" y="${cy + .55}">${esc(spot.label)}</text></g>`;
}).join('');
const gates = floor.gates.map((gate) => {
  const [a, b] = gate.opening;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  return `<line class="gate ${gate.direction}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="gate-label" x="${x}" y="${y - 2}">${gate.direction === 'inbound' ? 'IN' : 'OUT'}</text>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -14 ${floor.canvas.width} ${floor.canvas.height + 14}" role="img" aria-label="${esc(plan.garage.name)} ${esc(floor.name)}"><style>text{font-family:Arial,sans-serif}.shell{fill:#102a3a}.bay{fill:#e8f1f4;stroke:#c4d4dc;stroke-width:.35}.route{fill:#5b7380}.route.ramp{fill:#425f70;stroke:#d5e4e9;stroke-width:.25}.centreline{fill:none;stroke:#dbe7eb;stroke-width:.35;stroke-dasharray:1.4 1.1}.bay-label{fill:#55707d;font-size:2.2px;font-weight:700}.spot{stroke:#6e8997;stroke-width:.32}.spot.available{fill:#f9fcfd}.spot.occupied{fill:#ffd9d1;stroke:#d95c45;stroke-width:.5}.spot.manual{fill:#fce4a9;stroke:#b98214;stroke-width:.5}.spot-label{fill:#26434f;font-size:1.45px;text-anchor:middle;font-weight:700}.gate{stroke-width:1.5}.gate.inbound{stroke:#31b47d}.gate.outbound{stroke:#ff765b}.gate-label{font-size:1.7px;font-weight:800;text-anchor:middle;fill:#fff}.amenity{fill:#f8c56c;stroke:#8d6425;stroke-width:.35}.amenity-label{font-size:1.5px;font-weight:700;fill:#513912}</style><rect x="0" y="-14" width="100%" height="${floor.canvas.height + 14}" fill="#f4f7f8"/>${polygon(floor.footprint, 'shell')}<g>${routes}${bays}${amenities}${spots}${gates}</g><text x="4" y="-8" font-size="3" font-weight="800" fill="#143243">${esc(plan.garage.name)}</text><text x="4" y="-4.5" font-size="1.8" fill="#53717f">${esc(floor.name)} · Level ${floor.level} · white open · red occupied · amber manual</text></svg>`;
const output = valueAfter('--output') ?? `${basename(input, '.yml')}-${floor.id}.svg`;
await writeFile(resolve(output), svg);
console.log(JSON.stringify({ floor: floor.id, bays: floor.bays.length, spots: floor.bays.flatMap((bay) => bay.spots).length, output: resolve(output) }));
