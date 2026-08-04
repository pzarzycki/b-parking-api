import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';
import { buildApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.JWT_SECRET;
if (!databaseUrl || !secret) throw new Error('DATABASE_URL and JWT_SECRET are required.');
const db = new PrismaClient();
if (await db.user.count() === 0) await db.user.create({ data: { username: 'admin', passwordHash: await argon2.hash('admin'), role: Role.admin } });
const app = buildApp(db);
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
