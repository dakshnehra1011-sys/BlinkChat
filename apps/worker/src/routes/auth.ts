import { users } from '@blinkchat/database';
import { loginSchema, registerSchema } from '@blinkchat/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env } from '../types.js';
import { hashPassword, signJWT, verifyJWT, verifyPassword } from '../utils/crypto.js';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Register new user
authRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { email, password } = parsed.data;
  const db = drizzle(c.env.DB);

  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return c.json({ message: 'If an account exists for this email, please log in.' }, 200);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return c.json({ message: 'Account created. You can now log in.' }, 201);
});

// Login
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { email, password } = parsed.data;
  const db = drizzle(c.env.DB);

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // Issue 7-day session token
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const iat = Math.floor(Date.now() / 1000);
  const token = await signJWT(
    { userId: user.id, email: user.email, exp, iat },
    c.env.JWT_SIGNING_SECRET
  );

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
    },
  });
});

// Current user profile
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyJWT(token, c.env.JWT_SIGNING_SECRET);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, payload.userId)).get();
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  });
});
