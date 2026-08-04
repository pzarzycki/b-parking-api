import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaClient, Role } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';
import { buildApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.JWT_SECRET;
if (!databaseUrl || !secret) throw new Error('DATABASE_URL and JWT_SECRET are required.');
const db = new PrismaClient();
if (await db.user.count() === 0) await db.user.create({ data: { username: 'admin', passwordHash: await argon2.hash('admin'), role: Role.admin } });
const seedFloorPlan = process.env.SEED_FLOOR_PLAN;
if (seedFloorPlan && await db.garageLayout.count() === 0) {
  const yaml = await readFile(resolve(seedFloorPlan), 'utf8');
  const document = YAML.parseDocument(yaml, { uniqueKeys: true, prettyErrors: true });
  const schema = JSON.parse(await readFile(resolve('specs/floor-plan.schema.json'), 'utf8'));
  const validate = new (Ajv2020 as unknown as { new (options: object): { compile(value: object): (value: unknown) => boolean } })({ allErrors: true, strict: false }).compile(schema);
  const plan = document.toJS() as { floors: Array<{ id: string; level: number; name: string; bays: Array<{ id: string; name: string; spots: Array<{ id: string; label: string }> }> }> };
  if (document.errors.length || !validate(plan)) throw new Error(`SEED_FLOOR_PLAN is invalid: ${document.errors.map(String).join('; ') || 'does not match the floor-plan schema'}`);
  const admin = await db.user.findFirst({ where: { role: Role.admin, active: true } });
  if (!admin) throw new Error('SEED_FLOOR_PLAN requires an active admin user.');
  const sha256 = createHash('sha256').update(yaml).digest('hex');
  await db.$transaction(async (tx) => {
    for (const floor of plan.floors) {
      await tx.floor.create({ data: { id: floor.id, level: floor.level, name: floor.name } });
      for (const bay of floor.bays) {
        await tx.bay.create({ data: { id: bay.id, floorId: floor.id, name: bay.name } });
        await tx.parkingSpot.createMany({ data: bay.spots.map((spot) => ({ id: spot.id, floorId: floor.id, bayId: bay.id, number: spot.label })) });
      }
    }
    await tx.garageLayout.create({ data: { id: 1, yaml, revision: 1, sha256, uploadedById: admin.id } });
    await tx.auditEvent.create({ data: { actorId: admin.id, action: 'floor_plan_seeded', entityType: 'garage_layout', entityId: '1', details: { sha256 } } });
  });
}
const app = buildApp(db);
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
