import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import YAML from 'yaml';

type Point = { x: number; y: number };
type Polygon = { points: Point[] };
type Spot = { id: string; label: string; kind: 'standard' | 'accessible' | 'ev'; geometry: { x: number; y: number; width: number; height: number; rotation: number }; routeId: string };
type Bay = { id: string; name: string; geometry: Polygon; labelAt: Point; spots: Spot[] };
type Route = { id: string; kind: 'driveAisle' | 'way' | 'ramp'; direction: 'oneWay' | 'twoWay'; geometry: Polygon; centerline: Point[]; connectsTo: string[] };
type Gate = { id: string; direction: 'inbound' | 'outbound'; opening: [Point, Point]; connectsTo: string };
type Amenity = { id: string; type: 'lift' | 'stairs' | 'column'; geometry: Polygon; label: string };
type Floor = { id: string; level: number; name: string; canvas: { width: number; height: number }; footprint: Polygon; bays: Bay[]; routes: Route[]; gates: Gate[]; amenities: Amenity[] };
type Plan = { version: 2; garage: { id: string; name: string; units: string }; floors: Floor[] };

const args = process.argv.slice(2);
const valueAfter = (flag: string): string | undefined => { const index = args.indexOf(flag); return index === -1 ? undefined : args[index + 1]; };
const input = args.find((value, index) => !value.startsWith('--') && args[index - 1] !== '--floor' && args[index - 1] !== '--output');
if (!input) throw new Error('Usage: tsx scripts/render-floor-plan.ts <plan.yml> [--floor <id>] [--output <file.svg>] [--check]');

const text = await readFile(resolve(input), 'utf8');
const yaml = YAML.parseDocument(text, { prettyErrors: true, uniqueKeys: true });
if (yaml.errors.length || yaml.warnings.length) throw new Error([...yaml.errors, ...yaml.warnings].map(String).join('\n'));
const plan = yaml.toJS() as Plan;
const statusPath = valueAfter('--status');
const statuses: Record<string, 'available' | 'occupied' | 'manual'> = statusPath
  ? JSON.parse(await readFile(resolve(statusPath), 'utf8')) as Record<string, 'available' | 'occupied' | 'manual'>
  : {};

const errors: string[] = [];
const isPoint = (value: Point): boolean => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const idSet = new Set<string>();
const claim = (id: string, path: string): void => { if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)) errors.push(`${path}: invalid id`); if (idSet.has(id)) errors.push(`${path}: duplicate id ${id}`); idSet.add(id); };
const polygonArea = (points: Point[]): number => Math.abs(points.reduce((sum, p, index) => { const q = points[(index + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2);
const inside = (point: Point, polygon: Point[]): boolean => { let yes = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i]; const b = polygon[j]; if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) yes = !yes; } return yes; };
const validPolygon = (polygon: Polygon, path: string): void => { if (!polygon?.points || polygon.points.length < 3 || polygon.points.some((point) => !isPoint(point)) || polygonArea(polygon.points) === 0) errors.push(`${path}: needs a non-degenerate polygon`); };
if (plan?.version !== 2 || !plan.garage?.id || !Array.isArray(plan.floors) || plan.floors.length === 0) errors.push('root: expected version 2, garage, and floors');
for (const floor of plan.floors ?? []) {
  claim(floor.id, `floor ${floor.id}`); validPolygon(floor.footprint, floor.id); if (!Number.isInteger(floor.level) || floor.canvas.width <= 0 || floor.canvas.height <= 0) errors.push(`${floor.id}: invalid level or canvas`);
  const routes = new Set((floor.routes ?? []).map((route) => route.id));
  for (const route of floor.routes ?? []) { claim(route.id, `route ${route.id}`); validPolygon(route.geometry, route.id); if (!route.centerline || route.centerline.length < 2 || route.centerline.some((point) => !isPoint(point))) errors.push(`${route.id}: invalid centreline`); }
  for (const bay of floor.bays ?? []) { claim(bay.id, `bay ${bay.id}`); validPolygon(bay.geometry, bay.id); if (!inside(bay.labelAt, bay.geometry.points)) errors.push(`${bay.id}: label must be inside bay`); for (const spot of bay.spots ?? []) { claim(spot.id, `spot ${spot.id}`); const g = spot.geometry; if (!g || ![g.x, g.y, g.width, g.height, g.rotation].every(Number.isFinite) || g.width <= 0 || g.height <= 0 || g.rotation < 0 || g.rotation >= 360) errors.push(`${spot.id}: invalid geometry`); if (!routes.has(spot.routeId)) errors.push(`${spot.id}: unknown route ${spot.routeId}`); if (!inside({ x: g.x + g.width / 2, y: g.y + g.height / 2 }, bay.geometry.points)) errors.push(`${spot.id}: centre outside bay`); } }
  for (const gate of floor.gates ?? []) { claim(gate.id, `gate ${gate.id}`); if (floor.level !== 0) errors.push(`${gate.id}: gates are ground-floor only`); if (!['inbound', 'outbound'].includes(gate.direction) || !routes.has(gate.connectsTo) || gate.opening.length !== 2 || gate.opening.some((point) => !isPoint(point))) errors.push(`${gate.id}: invalid gate relationship`); }
  for (const amenity of floor.amenities ?? []) { claim(amenity.id, `amenity ${amenity.id}`); validPolygon(amenity.geometry, amenity.id); }
}
const ground = plan.floors?.find((floor) => floor.level === 0);
if (ground && (ground.gates.filter((gate) => gate.direction === 'inbound').length !== 2 || ground.gates.filter((gate) => gate.direction === 'outbound').length !== 2)) errors.push('ground floor requires exactly two inbound and two outbound gates');
if (errors.length) throw new Error(errors.join('\n'));
if (args.includes('--check')) { console.log(JSON.stringify({ garage: plan.garage.id, floors: plan.floors.length, spots: plan.floors.flatMap((floor) => floor.bays.flatMap((bay) => bay.spots)).length })); process.exit(0); }

const floorId = valueAfter('--floor') ?? plan.floors[0].id;
const floor = plan.floors.find((item) => item.id === floorId);
if (!floor) throw new Error(`unknown floor ${floorId}`);
const esc = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const points = (items: Point[]): string => items.map(({ x, y }) => `${x},${y}`).join(' ');
const poly = (polygon: Polygon, className: string): string => `<polygon class="${className}" points="${points(polygon.points)}"/>`;
const routes = floor.routes.map((route) => { const endMarker = route.direction === 'oneWay' ? ' marker-end="url(#arrow)"' : ' marker-start="url(#arrow-open)" marker-end="url(#arrow-open)"'; const label = route.kind === 'ramp' ? `<text class="ramp-label" x="${route.geometry.points[0].x + 1}" y="${route.geometry.points[0].y + 3}">RAMP · ${floor.level === 0 ? 'UP' : 'DOWN'}</text>` : ''; return `${poly(route.geometry, `route ${route.kind}`)}<polyline class="centreline ${route.direction}" points="${points(route.centerline)}"${endMarker}/>${label}`; }).join('');
const bays = floor.bays.map((bay) => `${poly(bay.geometry, 'bay')}<text class="bay-label" x="${bay.labelAt.x}" y="${bay.labelAt.y}">${esc(bay.name)}</text>`).join('');
const spots = floor.bays.flatMap((bay) => bay.spots).map((spot) => { const g = spot.geometry; const cx = g.x + g.width / 2; const cy = g.y + g.height / 2; const state = statuses[spot.id] ?? 'available'; if (!['available', 'occupied', 'manual'].includes(state)) throw new Error(`invalid status for ${spot.id}`); const badge = spot.kind === 'standard' ? '' : `<text class="spot-badge" x="${g.x + .65}" y="${g.y + 1.45}">${spot.kind === 'ev' ? 'EV' : 'A'}</text>`; return `<g transform="rotate(${g.rotation} ${cx} ${cy})"><rect class="spot ${spot.kind} ${state}" x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" rx="0.45"/>${badge}<text class="spot-label" x="${cx}" y="${cy + .55}">${esc(spot.label)}</text></g>`; }).join('');
const gates = floor.gates.map((gate) => { const [a, b] = gate.opening; const x = (a.x + b.x) / 2; const edgeY = (a.y + b.y) / 2; const y = edgeY < floor.canvas.height / 2 ? edgeY + 3 : edgeY - 1; const inward = Math.abs(a.y - b.y) > Math.abs(a.x - b.x) ? (x < floor.canvas.width / 2 ? '→' : '←') : (edgeY < floor.canvas.height / 2 ? '↓' : '↑'); const outward = ({ '↑': '↓', '↓': '↑', '←': '→', '→': '←' } as Record<string, string>)[inward]; const glyph = `${gate.direction === 'inbound' ? inward : outward} ${gate.direction === 'inbound' ? 'IN' : 'OUT'}`; return `<line class="gate ${gate.direction}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text class="gate-label" x="${x}" y="${y}">${glyph}</text>`; }).join('');
const amenities = floor.amenities.map((item) => `${poly(item.geometry, `amenity ${item.type}`)}<text class="amenity-label" x="${item.geometry.points[0].x + 1}" y="${item.geometry.points[0].y + 2}">${esc(item.label)}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -14 ${floor.canvas.width} ${floor.canvas.height + 14}" role="img" aria-label="${esc(plan.garage.name)} ${esc(floor.name)}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5 0 10z" fill="#dbe7eb"/></marker><marker id="arrow-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M1 1L9 5 1 9" fill="none" stroke="#dbe7eb" stroke-width="1.5"/></marker><style>text{font-family:Inter,Arial,sans-serif}.shell{fill:#102a3a}.bay{fill:#e8f1f4;stroke:#c4d4dc;stroke-width:.35}.route{fill:#5b7380}.route.ramp{fill:#425f70;stroke:#d5e4e9;stroke-width:.25}.centreline{fill:none;stroke:#c9d8de;stroke-width:.3;stroke-dasharray:1.4 1.1}.ramp-label{font-size:1.45px;font-weight:800;fill:#fff}.bay-label{fill:#55707d;font-size:2.2px;font-weight:700;letter-spacing:.12px}.spot{stroke-width:.32}.spot.available{fill:#f9fcfd}.spot.occupied{fill:#ffd9d1;stroke:#d95c45;stroke-width:.5}.spot.manual{fill:#fce4a9;stroke:#b98214;stroke-width:.5}.spot.accessible.available{fill:#cfe9ff;stroke:#2685c7}.spot.ev.available{fill:#d9f3dc;stroke:#27854a}.spot-label{fill:#26434f;font-size:1.45px;text-anchor:middle;font-weight:700}.spot-badge{fill:#24566f;font-size:1.05px;font-weight:800}.gate{stroke-width:1.5}.gate.inbound{stroke:#31b47d}.gate.outbound{stroke:#ff765b}.gate-label{font-size:1.7px;font-weight:800;text-anchor:middle;fill:#fff}.amenity{fill:#f8c56c;stroke:#8d6425;stroke-width:.35}.amenity-label{font-size:1.5px;font-weight:700;fill:#513912}</style></defs><rect x="0" y="-14" width="100%" height="${floor.canvas.height + 14}" fill="#f4f7f8"/>${poly(floor.footprint, 'shell')}<g>${routes}${bays}${amenities}${spots}${gates}</g><g transform="translate(4 -10)"><text font-size="3" font-weight="800" fill="#143243">${esc(plan.garage.name)}</text><text y="3.3" font-size="1.8" fill="#53717f">${esc(floor.name)} · Level ${floor.level} · white open · red occupied · amber manual · A accessible · EV charging</text></g><g transform="translate(${floor.canvas.width - 17} ${floor.canvas.height - 8})"><text font-size="2" fill="#fff">N ↑</text><path d="M4 2v-8" stroke="#fff" stroke-width=".7" marker-end="url(#arrow)"/></g></svg>`;
const output = valueAfter('--output') ?? `${basename(input, '.yml')}-${floor.id}.svg`;
await writeFile(resolve(output), svg);
console.log(JSON.stringify({ floor: floor.id, bays: floor.bays.length, spots: floor.bays.flatMap((bay) => bay.spots).length, output: resolve(output) }));
