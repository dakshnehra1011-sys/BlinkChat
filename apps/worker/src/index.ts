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

// Return ICE server configuration. TURN is required for users behind restrictive NATs.
app.get('/api/config/ice', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const user = await verifyJWT(authHeader.substring(7), c.env.JWT_SIGNING_SECRET);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const defaultStuns =
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302,stun:stun3.l.google.com:19302,stun:stun4.l.google.com:19302,stun:stun.cloudflare.com:3478';

  const stunList = (c.env.STUN_SERVERS ? `${c.env.STUN_SERVERS},${defaultStuns}` : defaultStuns)
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url, index, self) => self.indexOf(url) === index)
    .map((url) => ({ urls: url }));

  const iceServers: RTCIceServer[] = [...stunList];
  const isIceServer = (server: unknown): server is RTCIceServer =>
    typeof server === 'object' &&
    server !== null &&
    'urls' in server &&
    (typeof server.urls === 'string' || Array.isArray(server.urls));
  const containsTurn = (server: RTCIceServer) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some(
      (url) => url.startsWith('turn:') || url.startsWith('turns:')
    );

  let turnAvailable = false;

  // Cloudflare Realtime TURN is an optional relay fallback for restrictive NATs.
  // Keep its long-lived API token in Worker secrets and only return short-lived
  // per-user credentials to authenticated callers.
  if (c.env.CLOUDFLARE_TURN_KEY_ID && c.env.CLOUDFLARE_TURN_API_TOKEN) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(c.env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.CLOUDFLARE_TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 86400 }),
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const result: unknown = await res.json();
        const servers =
          typeof result === 'object' && result !== null && 'iceServers' in result
            ? result.iceServers
            : null;
        if (Array.isArray(servers)) {
          const validServers = servers.filter(isIceServer);
          iceServers.push(...validServers);
          turnAvailable ||= validServers.some(containsTurn);
        }
      } else {
        console.warn(`Cloudflare TURN credential request failed (${res.status})`);
      }
    } catch {
      console.warn('Failed to fetch Cloudflare TURN credentials');
    }
  }

  // Metered issues short-lived TURN credentials. Keep the API key on the Worker and
  // bound the upstream request so ICE configuration cannot hang call setup.
  if (c.env.METERED_DOMAIN && c.env.METERED_API_KEY) {
    try {
      const res = await fetch(
        `https://${c.env.METERED_DOMAIN}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(c.env.METERED_API_KEY)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const meteredServers: unknown = await res.json();
        if (Array.isArray(meteredServers)) {
          const validServers = meteredServers.filter(isIceServer);
          iceServers.push(...validServers);
          turnAvailable ||= validServers.some(containsTurn);
        }
      }
    } catch {
      console.warn('Failed to fetch dynamic TURN credentials');
    }
  }

  // Custom static TURN credentials (e.g. Coturn, Cloudflare Calls, Twilio)
  if (c.env.TURN_URLS && c.env.TURN_USERNAME && c.env.TURN_CREDENTIAL) {
    const turnUrls = c.env.TURN_URLS.split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const relayUrls = turnUrls.filter((url) => url.startsWith('turn:') || url.startsWith('turns:'));
    if (relayUrls.length > 0) {
      iceServers.push({
        urls: turnUrls,
        username: c.env.TURN_USERNAME,
        credential: c.env.TURN_CREDENTIAL,
      });
      turnAvailable = true;
    }
  }

  return c.json({ iceServers, turnAvailable });
});

// WebSocket Matchmaking Queue Endpoint
app.get('/api/ws/match', async (c) => {
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing authentication token', 401);
  }

  const payload = await verifyJWT(token, c.env.JWT_SIGNING_SECRET);
  if (!payload) {
    return c.text('Invalid or expired token', 401);
  }

  // Client ID allows distinct tabs/devices, but must be namespaced by the
  // authenticated account so one account cannot impersonate another tab.
  const requestedClientId = c.req.query('clientId');
  if (requestedClientId && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedClientId)) {
    return c.text('Invalid clientId', 400);
  }
  const clientId = `${payload.userId}:${requestedClientId || 'default'}`;

  // Get singleton Matchmaker DO instance
  const id = c.env.MATCHMAKER.idFromName('global-matchmaker');
  const matchmaker = c.env.MATCHMAKER.get(id);

  // Forward the request to MatchmakerDO with verified userId
  const url = new URL(c.req.url);
  url.searchParams.set('userId', clientId);
  url.searchParams.set('accountUserId', payload.userId);

  return matchmaker.fetch(new Request(url.toString(), c.req.raw));
});

// WebSocket WebRTC Signaling Session Endpoint
app.get('/api/ws/session', async (c) => {
  const token = c.req.query('token');
  const sessionId = c.req.query('sessionId');

  if (!token || !sessionId) {
    return c.text('Missing token or sessionId', 401);
  }

  const payload = await verifyJWT(token, c.env.JWT_SIGNING_SECRET);
  if (!payload) {
    return c.text('Invalid or expired token', 401);
  }

  const requestedClientId = c.req.query('clientId');
  if (requestedClientId && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedClientId)) {
    return c.text('Invalid clientId', 400);
  }
  const clientId = `${payload.userId}:${requestedClientId || 'default'}`;

  // Get Signaling DO instance for this sessionId
  const id = c.env.SIGNALING.idFromName(sessionId);
  const signaling = c.env.SIGNALING.get(id);

  const url = new URL(c.req.url);
  url.searchParams.set('userId', clientId);
  url.searchParams.set('accountUserId', payload.userId);
  url.searchParams.set('sessionId', sessionId);

  return signaling.fetch(new Request(url.toString(), c.req.raw));
});

export default app;
