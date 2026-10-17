import { describe, expect, it } from 'vitest';
import app from '../apps/worker/src/index.js';

describe('Worker HTTP API Endpoints', () => {
  it('GET /health returns status ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.status).toBe('ok');
    expect(json.service).toContain('BlinkChat');
  });

  it('GET /api/config/ice returns default STUN servers', async () => {
    const mockEnv = {
      STUN_SERVERS: 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
    };
    const res = await app.request('/api/config/ice', {}, mockEnv as any);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(Array.isArray(json.iceServers)).toBe(true);
    expect(json.iceServers.length).toBeGreaterThan(0);
    expect(json.iceServers[0].urls).toBe('stun:stun.l.google.com:19302');
  });

  it('GET /api/auth/me returns 401 when Authorization header is missing', async () => {
    const res = await app.request('/api/auth/me');
    expect(res.status).toBe(401);
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
