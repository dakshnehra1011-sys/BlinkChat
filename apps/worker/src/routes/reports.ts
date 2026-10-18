import { blocks, reports } from '@blinkchat/database';
import { reportSchema } from '@blinkchat/shared';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env } from '../types.js';
import { verifyJWT } from '../utils/crypto.js';

export const reportRoutes = new Hono<{ Bindings: Env }>();

// Submit report
reportRoutes.post('/', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, c.env.JWT_SIGNING_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { reportedUserId, reason, notes } = parsed.data;
  const db = drizzle(c.env.DB);

  await db.insert(reports).values({
    id: crypto.randomUUID(),
    reporterId: payload.userId,
    reportedUserId,
    reason,
    notes: notes || null,
    createdAt: new Date().toISOString(),
  });

  // Automatically block reported peer for this reporter
  await db.insert(blocks).values({
    id: crypto.randomUUID(),
    blockerId: payload.userId,
    blockedUserId: reportedUserId,
    createdAt: new Date().toISOString(),
  });

  return c.json({ message: 'Report submitted successfully. The user has been blocked.' }, 201);
});
