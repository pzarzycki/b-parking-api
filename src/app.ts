import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient, Role, SpotStatus, OccupancySource } from '@prisma/client';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import Ajv2020 from 'ajv/dist/2020.js';
import argon2 from 'argon2';
import YAML from 'yaml';
import { occupancyHistory } from './history.js';

type Token = { sub: string; role: Role };
const schema = JSON.parse(readFileSync(resolve('specs/floor-plan.schema.json'), 'utf8'));
const validateLayout = new (Ajv2020 as unknown as { new (x: object): { compile(x: object): (x: unknown) => boolean } })({ allErrors: true, strict: false }).compile(schema);
const plate = (value: string) => value.trim().toUpperCase();

export async function buildApp(db = new PrismaClient()) {
  const app = Fastify({ logger: true });
  const events = createEventHub();
  const tickets = new Map<string, { userId: string; expiresAt: number }>();
  app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? false });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? 'development-only-change-me' });
  app.register(swagger, { mode: 'static', specification: { path: resolve('specs/openapi.yaml'), baseDir: resolve('specs') } });
  app.register(swaggerUi, { routePrefix: '/api/docs' });
  await app.register(websocket);
  app.get('/openapi.yaml', async (_request, reply) => reply.type('application/yaml').send(readFileSync(resolve('specs/openapi.yaml'), 'utf8')));
  const auth = async (request: any, reply: any, roles?: Role[]) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send(problem(401, 'unauthorized', 'A valid bearer token is required.')); }
    if (roles && !roles.includes(request.user.role)) return reply.code(403).send(problem(403, 'forbidden', 'Your role cannot perform this operation.'));
  };
  app.setErrorHandler((error, _request, reply) => reply.code((error as any).statusCode ?? 500).send(problem((error as any).statusCode ?? 500, 'request_failed', error instanceof Error ? error.message : String(error))));

  app.post('/api/auth/login', async (request: any, reply) => {
    const { username, password } = request.body ?? {};
    const user = typeof username === 'string' ? await db.user.findUnique({ where: { username } }) : null;
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, password ?? ''))) return reply.code(401).send(problem(401, 'invalid_credentials', 'Invalid username or password.'));
    return { token: app.jwt.sign({ sub: user.id, role: user.role }), user: publicUser(user) };
  });
  app.get('/api/auth/me', { preHandler: (r, p) => auth(r, p) }, async (request: any) => publicUser(await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })));
  app.post('/api/auth/websocket-ticket', { preHandler: (r, p) => auth(r, p) }, async (request: any) => {
    for (const [value, ticket] of tickets) if (ticket.expiresAt < Date.now()) tickets.delete(value);
    const ticket = randomUUID(); const expiresAt = new Date(Date.now() + 60_000);
    tickets.set(ticket, { userId: request.user.sub, expiresAt: expiresAt.getTime() });
    return { ticket, expiresAt };
  });
  app.get('/api/events', { websocket: true }, (socket: any, request: any) => {
    const ticket = typeof request.query?.ticket === 'string' ? tickets.get(request.query.ticket) : undefined;
    if (!ticket || ticket.expiresAt < Date.now()) { if (typeof request.query?.ticket === 'string') tickets.delete(request.query.ticket); socket.close(1008, 'Invalid or expired WebSocket ticket.'); return; }
    tickets.delete(request.query.ticket);
    const client = { socket }; events.add(client);
    socket.send(JSON.stringify({ id: randomUUID(), type: 'ready', occurredAt: new Date().toISOString(), data: { userId: ticket.userId } }));
    socket.on('close', () => events.remove(client));
    socket.on('error', () => events.remove(client));
  });
  app.get('/api/garage/floor-plan', async (_request, reply) => {
    const layout = await db.garageLayout.findUnique({ where: { id: 1 } });
    return layout ? reply.type('application/yaml').send(layout.yaml) : reply.code(404).send(problem(404, 'layout_missing', 'No floor plan has been uploaded.'));
  });
  app.put('/api/garage/floor-plan', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any, reply) => {
    const yaml = request.body?.yaml;
    if (typeof yaml !== 'string') return reply.code(422).send(problem(422, 'invalid_layout', 'yaml must be a string.'));
    const doc = YAML.parseDocument(yaml, { uniqueKeys: true, prettyErrors: true });
    const plan: any = doc.toJS(); const layoutErrors = validateRelationships(plan);
    if (doc.errors.length || !validateLayout(plan) || layoutErrors.length) return reply.code(422).send({ ...problem(422, 'invalid_layout', 'The floor plan does not match the schema or contains invalid relationships.'), errors: layoutErrors.map((message) => ({ path: '/', message })) });
    const hash = createHash('sha256').update(yaml).digest('hex');
    await db.$transaction(async (tx) => {
      // Alpha reset semantics: a new layout replaces all layout-derived state and history.
      await tx.auditEvent.deleteMany(); await tx.parkingSession.deleteMany(); await tx.parkingSpot.deleteMany(); await tx.bay.deleteMany(); await tx.floor.deleteMany();
      for (const floor of plan.floors) { await tx.floor.create({ data: { id: floor.id, level: floor.level, name: floor.name } }); for (const bay of floor.bays) { await tx.bay.create({ data: { id: bay.id, floorId: floor.id, name: bay.name } }); await tx.parkingSpot.createMany({ data: bay.spots.map((spot: any) => ({ id: spot.id, floorId: floor.id, bayId: bay.id, number: spot.label })) }); } }
      await tx.garageLayout.upsert({ where: { id: 1 }, create: { id: 1, yaml, revision: 1, sha256: hash, uploadedById: request.user.sub }, update: { yaml, sha256: hash, revision: { increment: 1 }, uploadedById: request.user.sub } });
      await audit(tx, request.user.sub, 'floor_plan_uploaded', 'garage_layout', '1', { sha256: hash });
    });
    const revision = layoutRevision(await db.garageLayout.findUniqueOrThrow({ where: { id: 1 } })); events.publish('floor_plan.replaced', revision); return revision;
  });
  app.get('/api/parking-spots', { preHandler: (r, p) => auth(r, p) }, async (request: any) => page(db.parkingSpot, request.query, { ...(request.query?.status ? { status: request.query.status } : {}), ...(request.query?.floorId ? { floorId: request.query.floorId } : {}), ...(request.query?.bayId ? { bayId: request.query.bayId } : {}) }, [{ floorId: 'asc' }, { bayId: 'asc' }, { number: 'asc' }]));
  app.get('/api/parking-spots/available', { preHandler: (r, p) => auth(r, p) }, async (request: any) => page(db.parkingSpot, request.query, { status: SpotStatus.available, ...(request.query?.floorId ? { floorId: request.query.floorId } : {}), ...(request.query?.bayId ? { bayId: request.query.bayId } : {}) }, [{ floorId: 'asc' }, { bayId: 'asc' }, { number: 'asc' }]));
  app.get('/api/parking-spots/:spotId', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => {
    const spot = await db.parkingSpot.findUnique({ where: { id: request.params.spotId } });
    return spot ?? reply.code(404).send(problem(404, 'spot_missing', 'Parking spot does not exist.'));
  });
  app.patch('/api/parking-spots/:spotId', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => {
    const { status, reason } = request.body ?? {}; const spot = await db.parkingSpot.findUnique({ where: { id: request.params.spotId } });
    if (!spot) return reply.code(404).send(problem(404, 'spot_missing', 'Parking spot does not exist.'));
    if (status === SpotStatus.occupied) {
      if (spot.status === SpotStatus.occupied) return reply.code(409).send(problem(409, 'spot_occupied', 'The spot is already occupied.'));
      if (typeof reason !== 'string' || !reason.trim()) return reply.code(422).send(problem(422, 'manual_reason_required', 'reason is required for manual occupancy.'));
      const updated = await db.$transaction(async (tx) => { const value = await tx.parkingSpot.update({ where: { id: spot.id }, data: { status, occupancySource: OccupancySource.manual, manualReason: reason.trim() } }); await audit(tx, request.user.sub, 'spot_manually_occupied', 'parking_spot', spot.id, { reason: reason.trim() }); return value; }); events.publish('spot.status_changed', updated); return updated;
    }
    if (status === SpotStatus.available) {
      if (spot.occupancySource === OccupancySource.vehicle) return reply.code(409).send(problem(409, 'vehicle_checkout_required', 'Check out the vehicle to release this spot.'));
      const updated = await db.$transaction(async (tx) => { const value = await tx.parkingSpot.update({ where: { id: spot.id }, data: { status, occupancySource: null, manualReason: null } }); await audit(tx, request.user.sub, 'spot_manually_released', 'parking_spot', spot.id, {}); return value; }); events.publish('spot.status_changed', updated); return updated;
    }
    return reply.code(422).send(problem(422, 'invalid_status', 'status must be available or occupied.'));
  });
  app.post('/api/parking-sessions/check-in', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => {
    const licensePlate = plate(request.body?.licensePlate ?? ''); if (!licensePlate) return reply.code(422).send(problem(422, 'invalid_plate', 'licensePlate is required.'));
    try { const session = await db.$transaction(async (tx) => { if (await tx.parkingSession.findFirst({ where: { licensePlate, checkedOutAt: null } })) throw conflict('This license plate is already checked in.'); const spot = request.body?.spotId ? await tx.parkingSpot.findFirst({ where: { id: request.body.spotId, status: SpotStatus.available } }) : await tx.parkingSpot.findFirst({ where: { status: SpotStatus.available }, orderBy: [{ floorId: 'asc' }, { bayId: 'asc' }, { number: 'asc' }] }); if (!spot) throw conflict(request.body?.spotId ? 'The requested parking spot is unavailable.' : 'No available parking spot.'); const session = await tx.parkingSession.create({ data: { licensePlate, spotId: spot.id } }); await tx.parkingSpot.update({ where: { id: spot.id }, data: { status: SpotStatus.occupied, occupancySource: OccupancySource.vehicle } }); await audit(tx, request.user.sub, 'car_checked_in', 'parking_session', session.id, { spotId: spot.id }); return session; }); events.publish('parking.checked_in', session); return reply.code(201).send(session); } catch (error) { const status = (error as any).statusCode ?? ((error as any).code === 'P2002' ? 409 : 500); return reply.code(status).send(problem(status, status === 409 ? 'check_in_conflict' : 'check_in_failed', (error as Error).message)); }
  });
  app.post('/api/parking-sessions/check-out', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => { const hasSession = typeof request.body?.sessionId === 'string'; const hasPlate = typeof request.body?.licensePlate === 'string'; if (hasSession === hasPlate) return reply.code(422).send(problem(422, 'invalid_checkout', 'Supply exactly one of sessionId or licensePlate.')); const q = hasSession ? { id: request.body.sessionId } : { licensePlate: plate(request.body.licensePlate), checkedOutAt: null }; const session = await db.parkingSession.findFirst({ where: q }); if (!session) return reply.code(404).send(problem(404, 'session_missing', 'No active session found.')); const updated = await db.$transaction(async tx => { const result = await tx.parkingSession.update({ where: { id: session.id }, data: { checkedOutAt: new Date() } }); await tx.parkingSpot.update({ where: { id: session.spotId }, data: { status: SpotStatus.available, occupancySource: null, manualReason: null } }); await audit(tx, request.user.sub, 'car_checked_out', 'parking_session', result.id, {}); return result; }); events.publish('parking.checked_out', updated); return updated; });
  app.get('/api/history/occupancy', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => {
    const { bayId, spotId, from: rawFrom, to: rawTo } = request.query ?? {};
    if (typeof bayId !== 'string' || typeof rawFrom !== 'string' || typeof rawTo !== 'string') return reply.code(422).send(problem(422, 'invalid_history_range', 'bayId, from, and to are required.'));
    if (spotId !== undefined && typeof spotId !== 'string') return reply.code(422).send(problem(422, 'invalid_history_asset', 'spotId must be a string when supplied.'));
    const from = new Date(rawFrom); const to = new Date(rawTo);
    if (!rawFrom.endsWith('Z') || !rawTo.endsWith('Z') || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) return reply.code(422).send(problem(422, 'invalid_history_range', 'from and to must be valid UTC timestamps defining a range of at most 90 days.'));
    const bay = await db.bay.findUnique({ where: { id: bayId } });
    if (!bay) return reply.code(404).send(problem(404, 'bay_missing', 'Parking bay does not exist.'));
    const spots = await db.parkingSpot.findMany({ where: { bayId, ...(spotId ? { id: spotId } : {}) }, orderBy: { number: 'asc' } });
    if (spotId && spots.length === 0) return reply.code(404).send(problem(404, 'spot_missing', 'Parking spot does not exist in the selected bay.'));
    const spotIds = spots.map((spot) => spot.id);
    const [sessions, manualEvents] = await Promise.all([
      db.parkingSession.findMany({ where: { spotId: { in: spotIds }, checkedInAt: { lt: to }, OR: [{ checkedOutAt: null }, { checkedOutAt: { gt: from } }] } }),
      db.auditEvent.findMany({ where: { entityType: 'parking_spot', entityId: { in: spotIds }, action: { in: ['spot_manually_occupied', 'spot_manually_released'] }, occurredAt: { lt: to } }, orderBy: { occurredAt: 'asc' } })
    ]);
    const granularity = to.getTime() - from.getTime() <= 48 * 60 * 60 * 1000 ? 'hour' : 'day';
    const history = occupancyHistory({
      spotIds,
      sessions,
      manualEvents: manualEvents.map((event) => ({ spotId: event.entityId, action: event.action as 'spot_manually_occupied' | 'spot_manually_released', occurredAt: event.occurredAt })),
      from,
      to,
      granularity
    });
    return {
      asset: { type: spotId ? 'spot' : 'bay', id: spotId ?? bay.id, floorId: bay.floorId, bayId: bay.id, name: spotId ? spots[0].number : bay.name, capacity: spots.length },
      from,
      to,
      granularity,
      ...history
    };
  });
  app.get('/api/parking-sessions', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any) => page(db.parkingSession, request.query, { ...(request.query?.licensePlate ? { licensePlate: plate(request.query.licensePlate) } : {}), ...(request.query?.active === 'true' ? { checkedOutAt: null } : request.query?.active === 'false' ? { checkedOutAt: { not: null } } : {}) }, { checkedInAt: 'desc' }));
  app.get('/api/audit-events', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any) => page(db.auditEvent, request.query, { ...(request.query?.action ? { action: request.query.action } : {}), ...(request.query?.actorId ? { actorId: request.query.actorId } : {}), ...(request.query?.entityId ? { entityId: request.query.entityId } : {}) }, { occurredAt: 'desc' }));
  app.get('/api/users', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async () => (await db.user.findMany({ orderBy: { username: 'asc' } })).map(publicUser));
  app.post('/api/users', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any, reply) => {
    const { username, password, role } = request.body ?? {}; if (!['admin', 'attendant'].includes(role) || typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 8) return reply.code(422).send(problem(422, 'invalid_user', 'username, an 8-character password, and a valid role are required.'));
    try { const user = await db.user.create({ data: { username: username.trim(), passwordHash: await argon2.hash(password), role } }); await audit(db, request.user.sub, 'user_created', 'user', user.id, { username: user.username, role: user.role }); return reply.code(201).send(publicUser(user)); } catch { return reply.code(409).send(problem(409, 'username_taken', 'username is already in use.')); }
  });
  app.patch('/api/users/:userId', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any, reply) => {
    const existing = await db.user.findUnique({ where: { id: request.params.userId } }); if (!existing) return reply.code(404).send(problem(404, 'user_missing', 'User does not exist.'));
    const { role, active, password } = request.body ?? {}; if (role !== undefined && !['admin', 'attendant'].includes(role)) return reply.code(422).send(problem(422, 'invalid_role', 'role must be admin or attendant.'));
    if (role === undefined && active === undefined && password === undefined || typeof password === 'string' && password.length < 8) return reply.code(422).send(problem(422, 'invalid_user_update', 'Provide a valid role, active state, or an 8-character password.'));
    if ((active === false || role === 'attendant') && existing.role === Role.admin && await db.user.count({ where: { role: Role.admin, active: true } }) === 1) return reply.code(409).send(problem(409, 'last_admin', 'The final active admin cannot be removed or demoted.'));
    const user = await db.user.update({ where: { id: existing.id }, data: { ...(role !== undefined ? { role } : {}), ...(typeof active === 'boolean' ? { active } : {}), ...(typeof password === 'string' ? { passwordHash: await argon2.hash(password) } : {}) } }); await audit(db, request.user.sub, 'user_updated', 'user', user.id, {}); return publicUser(user);
  });
  return app;
}
const problem = (status: number, code: string, detail: string) => ({ type: `https://parking.example/problems/${code}`, title: code, status, detail, code });
const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
const publicUser = (user: any) => ({ id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt });
const layoutRevision = (layout: any) => ({ revision: layout.revision, sha256: layout.sha256, updatedAt: layout.updatedAt, uploadedBy: layout.uploadedById });
const audit = (tx: any, actorId: string, action: string, entityType: string, entityId: string, details: object) => tx.auditEvent.create({ data: { actorId, action, entityType, entityId, details } });
async function page(model: any, query: Record<string, string | undefined> | undefined, where: object, orderBy: object) {
  const pageNumber = Math.max(1, Number(query?.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize ?? 50) || 50));
  const [items, total] = await Promise.all([model.findMany({ where, orderBy, skip: (pageNumber - 1) * pageSize, take: pageSize }), model.count({ where })]);
  return { items, page: pageNumber, pageSize, total };
}
function createEventHub() {
  const clients = new Set<{ socket: any }>();
  return {
    add: (client: { socket: any }) => clients.add(client),
    remove: (client: { socket: any }) => clients.delete(client),
    publish: (type: string, data: object) => {
      const message = JSON.stringify({ id: randomUUID(), type, occurredAt: new Date().toISOString(), data });
      for (const client of clients) if (client.socket.readyState === 1) client.socket.send(message);
    }
  };
}
function validateRelationships(plan: any): string[] {
  const errors: string[] = []; const ids = new Set<string>();
  const claim = (id: string, label: string) => { if (ids.has(id)) errors.push(`duplicate ${label} ID: ${id}`); ids.add(id); };
  for (const floor of plan?.floors ?? []) {
    claim(floor.id, 'floor'); const routes = new Set<string>();
    for (const route of floor.routes ?? []) { claim(route.id, 'route'); routes.add(route.id); }
    for (const route of floor.routes ?? []) for (const connection of route.connectsTo ?? []) if (!routes.has(connection)) errors.push(`${route.id} references unknown route ${connection}`);
    for (const gate of floor.gates ?? []) { claim(gate.id, 'gate'); if (floor.level !== 0) errors.push(`${gate.id} is on a non-ground floor`); if (!routes.has(gate.connectsTo)) errors.push(`${gate.id} references unknown route ${gate.connectsTo}`); }
    for (const amenity of floor.amenities ?? []) claim(amenity.id, 'amenity');
    for (const bay of floor.bays ?? []) { claim(bay.id, 'bay'); for (const spot of bay.spots ?? []) { claim(spot.id, 'spot'); if (!routes.has(spot.routeId)) errors.push(`${spot.id} references unknown route ${spot.routeId}`); } }
  }
  return errors;
}
