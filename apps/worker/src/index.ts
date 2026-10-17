import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './routes/auth.js';
import { reportRoutes } from './routes/reports.js';
import type { Env } from './types.js';
import { verifyJWT } from './utils/crypto.js';

// Export Durable Objects for Cloudflare Workers runtime
export { MatchmakerDO } from './durable-objects/MatchmakerDO.js';
export { SignalingDO } from './durable-objects/SignalingDO.js';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for frontend
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Upgrade'],
  })
);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'BlinkChat Edge Worker' }));

// Mount HTTP sub-routes
app.route('/api/auth', authRoutes);
app.route('/api/reports', reportRoutes);

// Return ICE server configuration (STUN + optional TURN)
app.get('/api/config/ice', (c) => {
  const stunList = (
    c.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
  )
    .split(',')
    .map((url) => ({ urls: url.trim() }));

  const iceServers: RTCIceServer[] = [...stunList];

  if (c.env.TURN_URLS && c.env.TURN_USERNAME && c.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: c.env.TURN_URLS.split(',').map((u) => u.trim()),
      username: c.env.TURN_USERNAME,
      credential: c.env.TURN_CREDENTIAL,
    });
  }

  return c.json({ iceServers });
});

// WebSocket Matchmaking Queue Endpoint
app.get('/api/ws/match', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing authentication token', 401);
  }

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.text('Invalid or expired token', 401);
  }

  // Get singleton Matchmaker DO instance
  const id = c.env.MATCHMAKER.idFromName('global-matchmaker');
  const matchmaker = c.env.MATCHMAKER.get(id);

  // Forward the request to MatchmakerDO with verified userId
  const url = new URL(c.req.url);
  url.searchParams.set('userId', payload.userId);

  return matchmaker.fetch(new Request(url.toString(), c.req.raw));
});

// WebSocket WebRTC Signaling Session Endpoint
app.get('/api/ws/session', async (c) => {
  const token = c.req.query('token');
  const sessionId = c.req.query('sessionId');

  if (!token || !sessionId) {
    return c.text('Missing token or sessionId', 401);
  }

  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.text('Invalid or expired token', 401);
  }

  // Get Signaling DO instance for this sessionId
  const id = c.env.SIGNALING.idFromName(sessionId);
  const signaling = c.env.SIGNALING.get(id);

  const url = new URL(c.req.url);
  url.searchParams.set('userId', payload.userId);
  url.searchParams.set('sessionId', sessionId);

  return signaling.fetch(new Request(url.toString(), c.req.raw));
});

export default app;
