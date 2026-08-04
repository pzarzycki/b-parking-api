import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient, Role, SpotStatus, OccupancySource } from '@prisma/client';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import Ajv2020 from 'ajv/dist/2020.js';
import argon2 from 'argon2';
import YAML from 'yaml';

type Token = { sub: string; role: Role };
const schema = JSON.parse(readFileSync(resolve('specs/floor-plan.schema.json'), 'utf8'));
const validateLayout = new (Ajv2020 as unknown as { new (x: object): { compile(x: object): (x: unknown) => boolean } })({ allErrors: true, strict: false }).compile(schema);
const plate = (value: string) => value.trim().toUpperCase();

export function buildApp(db = new PrismaClient()) {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? false });
  app.register(jwt, { secret: process.env.JWT_SECRET ?? 'development-only-change-me' });
  app.register(swagger, { mode: 'static', specification: { path: resolve('specs/openapi.yaml') } });
  app.register(swaggerUi, { routePrefix: '/api/docs' });
  const auth = async (request: any, reply: any, roles?: Role[]) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send(problem(401, 'unauthorized', 'A valid bearer token is required.')); }
    if (roles && !roles.includes(request.user.role)) return reply.code(403).send(problem(403, 'forbidden', 'Your role cannot perform this operation.'));
  };
  app.setErrorHandler((error, _request, reply) => reply.code((error as any).statusCode ?? 500).send(problem((error as any).statusCode ?? 500, 'request_failed', error.message)));

  app.post('/api/auth/login', async (request: any, reply) => {
    const { username, password } = request.body ?? {};
    const user = typeof username === 'string' ? await db.user.findUnique({ where: { username } }) : null;
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, password ?? ''))) return reply.code(401).send(problem(401, 'invalid_credentials', 'Invalid username or password.'));
    return { token: app.jwt.sign({ sub: user.id, role: user.role }), user: publicUser(user) };
  });
  app.get('/api/auth/me', { preHandler: (r, p) => auth(r, p) }, async (request: any) => publicUser(await db.user.findUniqueOrThrow({ where: { id: request.user.sub } })));
  app.get('/api/garage/floor-plan', async (_request, reply) => {
    const layout = await db.garageLayout.findUnique({ where: { id: 1 } });
    return layout ? reply.type('application/yaml').send(layout.yaml) : reply.code(404).send(problem(404, 'layout_missing', 'No floor plan has been uploaded.'));
  });
  app.put('/api/garage/floor-plan', { preHandler: (r, p) => auth(r, p, [Role.admin]) }, async (request: any, reply) => {
    const yaml = request.body?.yaml;
    if (typeof yaml !== 'string') return reply.code(422).send(problem(422, 'invalid_layout', 'yaml must be a string.'));
    const doc = YAML.parseDocument(yaml, { uniqueKeys: true, prettyErrors: true });
    if (doc.errors.length || !validateLayout(doc.toJS())) return reply.code(422).send(problem(422, 'invalid_layout', 'The floor plan does not match the schema.'));
    const plan: any = doc.toJS(); const hash = createHash('sha256').update(yaml).digest('hex');
    await db.$transaction(async (tx) => {
      await tx.parkingSpot.deleteMany(); await tx.bay.deleteMany(); await tx.floor.deleteMany();
      for (const floor of plan.floors) { await tx.floor.create({ data: { id: floor.id, level: floor.level, name: floor.name } }); for (const bay of floor.bays) { await tx.bay.create({ data: { id: bay.id, floorId: floor.id, name: bay.name } }); await tx.parkingSpot.createMany({ data: bay.spots.map((spot: any) => ({ id: spot.id, floorId: floor.id, bayId: bay.id, number: spot.number })) }); } }
      await tx.garageLayout.upsert({ where: { id: 1 }, create: { id: 1, yaml, revision: 1, sha256: hash, uploadedById: request.user.sub }, update: { yaml, sha256: hash, revision: { increment: 1 }, uploadedById: request.user.sub } });
      await audit(tx, request.user.sub, 'floor_plan_uploaded', 'garage_layout', '1', { sha256: hash });
    });
    return db.garageLayout.findUniqueOrThrow({ where: { id: 1 } });
  });
  app.get('/api/parking-spots', { preHandler: (r, p) => auth(r, p) }, async (request: any) => db.parkingSpot.findMany({ where: { ...(request.query?.status ? { status: request.query.status } : {}), ...(request.query?.floorId ? { floorId: request.query.floorId } : {}) }, orderBy: [{ floorId: 'asc' }, { bayId: 'asc' }, { number: 'asc' }] }));
  app.get('/api/parking-spots/available', { preHandler: (r, p) => auth(r, p) }, async () => db.parkingSpot.findMany({ where: { status: SpotStatus.available } }));
  app.post('/api/parking-sessions/check-in', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => {
    const licensePlate = plate(request.body?.licensePlate ?? ''); if (!licensePlate) return reply.code(422).send(problem(422, 'invalid_plate', 'licensePlate is required.'));
    try { return await db.$transaction(async (tx) => { if (await tx.parkingSession.findFirst({ where: { licensePlate, checkedOutAt: null } })) throw conflict('This license plate is already checked in.'); const spot = await tx.parkingSpot.findFirst({ where: { id: request.body?.spotId, status: SpotStatus.available } }) ?? await tx.parkingSpot.findFirst({ where: { status: SpotStatus.available }, orderBy: [{ floorId: 'asc' }, { bayId: 'asc' }, { number: 'asc' }] }); if (!spot) throw conflict('No available parking spot.'); const session = await tx.parkingSession.create({ data: { licensePlate, spotId: spot.id } }); await tx.parkingSpot.update({ where: { id: spot.id }, data: { status: SpotStatus.occupied, occupancySource: OccupancySource.vehicle } }); await audit(tx, request.user.sub, 'car_checked_in', 'parking_session', session.id, { spotId: spot.id }); return session; }); } catch (error) { return reply.code((error as any).statusCode ?? 500).send(problem((error as any).statusCode ?? 500, 'check_in_failed', (error as Error).message)); }
  });
  app.post('/api/parking-sessions/check-out', { preHandler: (r, p) => auth(r, p) }, async (request: any, reply) => { const q = request.body?.sessionId ? { id: request.body.sessionId } : request.body?.licensePlate ? { licensePlate: plate(request.body.licensePlate), checkedOutAt: null } : null; if (!q) return reply.code(422).send(problem(422, 'invalid_checkout', 'Supply sessionId or licensePlate.')); const session = await db.parkingSession.findFirst({ where: q }); if (!session) return reply.code(404).send(problem(404, 'session_missing', 'No active session found.')); const updated = await db.$transaction(async tx => { const result = await tx.parkingSession.update({ where: { id: session.id }, data: { checkedOutAt: new Date() } }); await tx.parkingSpot.update({ where: { id: session.spotId }, data: { status: SpotStatus.available, occupancySource: null } }); await audit(tx, request.user.sub, 'car_checked_out', 'parking_session', result.id, {}); return result; }); return updated; });
  return app;
}
const problem = (status: number, code: string, detail: string) => ({ type: `https://parking.example/problems/${code}`, title: code, status, detail, code });
const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
const publicUser = (user: any) => ({ id: user.id, username: user.username, role: user.role, active: user.active, createdAt: user.createdAt, updatedAt: user.updatedAt });
const audit = (tx: any, actorId: string, action: string, entityType: string, entityId: string, details: object) => tx.auditEvent.create({ data: { actorId, action, entityType, entityId, details } });
