import { emailVerifications, users } from '@blinkchat/database';
import { loginSchema, registerSchema, verifyEmailSchema } from '@blinkchat/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env } from '../types.js';
import {
  generateRandomToken,
  hashPassword,
  sha256,
  signJWT,
  verifyJWT,
  verifyPassword,
} from '../utils/crypto.js';
import { sendVerificationEmail } from '../utils/email.js';

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
    // Return generic message to avoid email enumeration
    return c.json(
      { message: 'If this email is not registered, a verification link has been sent.' },
      200
    );
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    emailVerified: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create verification token (expires in 24 hours)
  const token = generateRandomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db.insert(emailVerifications).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  // Dispatch verification email
  const baseUrl = c.req.header('origin') || 'http://localhost:5173';
  await sendVerificationEmail(
    { to: email, subject: 'Verify your BlinkChat account', verificationToken: token, baseUrl },
    c.env.RESEND_API_KEY,
    c.env.EMAIL_FROM
  );

  return c.json(
    {
      message: 'Registration successful. Please check your email to verify your account.',
      devToken: c.env.ENVIRONMENT === 'development' ? token : undefined,
    },
    201
  );
});

// Verify email address
authRoutes.post('/verify-email', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { token } = parsed.data;
  const db = drizzle(c.env.DB);
  const tokenHash = await sha256(token);

  const record = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.tokenHash, tokenHash))
    .get();
  if (!record) {
    return c.json({ error: 'Invalid or expired verification token' }, 400);
  }

  if (new Date(record.expiresAt) < new Date()) {
    await db.delete(emailVerifications).where(eq(emailVerifications.id, record.id));
    return c.json({ error: 'Verification token has expired' }, 400);
  }

  // Mark user as verified
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date().toISOString() })
    .where(eq(users.id, record.userId));

  // Delete used token
  await db.delete(emailVerifications).where(eq(emailVerifications.id, record.id));

  return c.json({ message: 'Email successfully verified! You can now log in.' }, 200);
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
      emailVerified: Boolean(user.emailVerified),
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
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
  });
});
