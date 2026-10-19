import { describe, expect, it, vi } from 'vitest';
import app from '../apps/worker/src/index.js';
import { signJWT } from '../apps/worker/src/utils/crypto.js';

describe('Worker HTTP API Endpoints', () => {
  it('GET /health returns status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.status).toBe('ok');
    expect(json.service).toContain('BlinkChat');
  });

  it('GET /api/config/ice returns default STUN servers', async () => {
    const secret = 'unit-test-jwt-secret';
    const token = await signJWT(
      {
        userId: 'test-user',
        email: 'test@example.test',
        exp: Math.floor(Date.now() / 1000) + 60,
        iat: Math.floor(Date.now() / 1000),
      },
      secret
    );
    const mockEnv = {
      STUN_SERVERS: 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
      JWT_SIGNING_SECRET: secret,
    };
    const res = await app.request(
      '/api/config/ice',
      { headers: { Authorization: `Bearer ${token}` } },
      mockEnv as any
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.iceServers)).toBe(true);
    expect(json.iceServers.length).toBeGreaterThan(0);
    expect(json.iceServers[0].urls).toBe('stun:stun.l.google.com:19302');
  });

  it('GET /api/config/ice rejects unauthenticated credential requests', async () => {
    const res = await app.request('/api/config/ice', {}, { JWT_SIGNING_SECRET: 'test' } as any);
    expect(res.status).toBe(401);
  });

  it('GET /api/config/ice returns short-lived Cloudflare TURN servers when configured', async () => {
    const secret = 'unit-test-jwt-secret';
    const token = await signJWT(
      {
        userId: 'test-user',
        email: 'test@example.test',
        exp: Math.floor(Date.now() / 1000) + 60,
        iat: Math.floor(Date.now() / 1000),
      },
      secret
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          iceServers: [
            {
              urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
              username: 'ephemeral-user',
              credential: 'ephemeral-password',
            },
          ],
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const res = await app.request(
        '/api/config/ice',
        { headers: { Authorization: `Bearer ${token}` } },
        {
          JWT_SIGNING_SECRET: secret,
          CLOUDFLARE_TURN_KEY_ID: 'unit-test-turn-key',
          CLOUDFLARE_TURN_API_TOKEN: 'unit-test-api-token',
        } as any
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as { iceServers: RTCIceServer[]; turnAvailable: boolean };
      expect(json.turnAvailable).toBe(true);
      expect(json.iceServers.some((server) => server.urls?.toString().startsWith('turn:'))).toBe(
        true
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://rtc.live.cloudflare.com/v1/turn/keys/unit-test-turn-key/credentials/generate-ice-servers',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('GET /api/auth/me returns 401 when Authorization header is missing', async () => {
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('removes the obsolete email verification endpoint', async () => {
    const res = await app.request('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
  });

  it('POST /api/reports returns 401 when unauthenticated', async () => {
    const res = await app.request('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportedUserId: 'u1', reason: 'other' }),
    });
    expect(res.status).toBe(401);
  });
});
