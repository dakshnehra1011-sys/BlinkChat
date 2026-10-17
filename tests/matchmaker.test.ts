import { describe, expect, it, vi } from 'vitest';
import { MatchmakerDO } from '../apps/worker/src/durable-objects/MatchmakerDO.js';

describe('MatchmakerDO Queue Logic', () => {
  it('manages queue additions, self-match prevention, and pairing', () => {
    // Mock DurableObjectState and Env
    const mockState = {} as any;
    const mockEnv = {} as any;

    const matchmaker = new MatchmakerDO(mockState, mockEnv);

    // Mock WebSocket objects
    const messagesPeer1: any[] = [];
    const messagesPeer2: any[] = [];

    const ws1 = {
      readyState: 1, // OPEN
      send: vi.fn((data: string) => messagesPeer1.push(JSON.parse(data))),
      close: vi.fn(),
    } as any;

    const ws2 = {
      readyState: 1, // OPEN
      send: vi.fn((data: string) => messagesPeer2.push(JSON.parse(data))),
      close: vi.fn(),
    } as any;

    // 1. Peer 1 joins
    matchmaker.addToQueue('user-1', ws1);
    expect(matchmaker.queue.length).toBe(1);
    expect(messagesPeer1[0]?.type).toBe('queue.status');
    expect(messagesPeer1[0]?.status).toBe('queued');

    // 2. Peer 1 tries to add again (should not duplicate or self-match)
    matchmaker.addToQueue('user-1', ws1);
    expect(matchmaker.queue.length).toBe(1);

    // 3. Try match with only 1 user (should remain in queue)
    matchmaker.tryMatch();
    expect(matchmaker.queue.length).toBe(1);

    // 4. Peer 2 joins
    matchmaker.addToQueue('user-2', ws2);
    expect(matchmaker.queue.length).toBe(2);

    // 5. Trigger match
    matchmaker.tryMatch();

    // Queue should now be empty (both matched)
    expect(matchmaker.queue.length).toBe(0);

    // Peer 1 receives match.found
    const match1 = messagesPeer1.find((m) => m.type === 'match.found');
    expect(match1).toBeDefined();
    expect(match1.peerId).toBe('user-2');
    expect(match1.isInitiator).toBe(true);

    // Peer 2 receives match.found
    const match2 = messagesPeer2.find((m) => m.type === 'match.found');
    expect(match2).toBeDefined();
    expect(match2.peerId).toBe('user-1');
    expect(match2.isInitiator).toBe(false);

    // Both peers share the exact same sessionId
    expect(match1.sessionId).toBe(match2.sessionId);
  });

  it('handles WebSocket events: join, leave, heartbeat, duplicate eviction, and disconnect', () => {
    const mockState = {} as any;
    const mockEnv = {} as any;
    const matchmaker = new MatchmakerDO(mockState, mockEnv);

    const inbox1: any[] = [];
    const listeners1: Record<string, Function[]> = {};

    const ws1 = {
      readyState: 1,
      send: vi.fn((data: string) => inbox1.push(JSON.parse(data))),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: (event: string, fn: Function) => {
        listeners1[event] = listeners1[event] || [];
        listeners1[event].push(fn);
      },
    } as any;

    // Attach socket
    matchmaker.handleWebSocket(ws1, 'user-alice');
    expect(ws1.accept).toHaveBeenCalled();

    // Trigger queue.join via WS message
    listeners1.message?.forEach((fn) => fn({ data: JSON.stringify({ type: 'queue.join' }) }));
    expect(matchmaker.queue.length).toBe(1);
    expect(inbox1[0]?.type).toBe('queue.status');
    expect(inbox1[0]?.status).toBe('queued');

    // Trigger heartbeat
    listeners1.message?.forEach((fn) => fn({ data: JSON.stringify({ type: 'heartbeat' }) }));
    expect(inbox1.some((m) => m.type === 'heartbeat_ack')).toBe(true);

    // Trigger invalid payload
    listeners1.message?.forEach((fn) => fn({ data: JSON.stringify({ type: 'bogus' }) }));
    expect(inbox1.some((m) => m.type === 'error' && m.code === 'INVALID_PAYLOAD')).toBe(true);

    // Trigger queue.leave
    listeners1.message?.forEach((fn) => fn({ data: JSON.stringify({ type: 'queue.leave' }) }));
    expect(matchmaker.queue.length).toBe(0);

    // Re-join and then test duplicate connection replacement
    matchmaker.addToQueue('user-alice', ws1);
    expect(matchmaker.queue.length).toBe(1);

    const ws2 = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: vi.fn(),
    } as any;

    matchmaker.handleWebSocket(ws2, 'user-alice');
    expect(ws1.close).toHaveBeenCalledWith(1000, 'Duplicate connection replaced');

    // Test socket close event cleans up queue and map
    listeners1.close?.forEach((fn) => fn());
    expect(matchmaker.userSocketMap.has('user-alice')).toBe(false);

    // Test socket error event cleans up queue and map
    matchmaker.handleWebSocket(ws1, 'user-carol');
    expect(matchmaker.userSocketMap.has('user-carol')).toBe(true);
    listeners1.error?.forEach((fn) => fn());
    expect(matchmaker.userSocketMap.has('user-carol')).toBe(false);
  });

  it('handles self-match branch and purges closed sockets in tryMatch', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const wsOpen = { readyState: 1, send: vi.fn(), close: vi.fn() } as any;
    const wsClosed = { readyState: 3, send: vi.fn(), close: vi.fn() } as any;

    // Purge closed sockets
    matchmaker.queue = [
      { userId: 'dead-1', ws: wsClosed, joinedAt: 1 },
      { userId: 'user-1', ws: wsOpen, joinedAt: 2 },
      { userId: 'user-1', ws: wsOpen, joinedAt: 3 }, // duplicate userId to hit self-match branch
      { userId: 'user-2', ws: wsOpen, joinedAt: 4 },
    ];

    matchmaker.tryMatch();
    // Dead was purged, self-match user-1/user-1 was unshifted and user-1 paired with user-2
    expect(wsOpen.send).toHaveBeenCalled();
  });

  it('handles fetch() request validation and upgrades', async () => {
    // Mock WebSocketPair
    (globalThis as any).WebSocketPair = class {
      0: any;
      1: any;
      constructor() {
        this[0] = { accept: vi.fn(), send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
        this[1] = { accept: vi.fn(), send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
      }
    };

    const matchmaker = new MatchmakerDO({} as any, {} as any);

    // Missing userId
    const resNoUser = await matchmaker.fetch(new Request('http://localhost/api/ws/match'));
    expect(resNoUser.status).toBe(400);

    // Missing Upgrade header
    const resNoUpgrade = await matchmaker.fetch(
      new Request('http://localhost/api/ws/match?userId=u1')
    );
    expect(resNoUpgrade.status).toBe(426);

    // Valid WebSocket upgrade
    const resOk = await matchmaker.fetch(
      new Request('http://localhost/api/ws/match?userId=u1', {
        headers: { Upgrade: 'websocket' },
      })
    );
    expect([101, 200]).toContain(resOk.status);
  });
});
