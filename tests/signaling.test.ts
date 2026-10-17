import { describe, expect, it, vi } from 'vitest';
import { SignalingDO } from '../apps/worker/src/durable-objects/SignalingDO.js';

describe('SignalingDO Two-Peer WebRTC Lifecycle', () => {
  it('coordinates SDP Offer/Answer, ICE trickle, and Next/Leave teardown between two peers', () => {
    const mockState = {} as any;
    const mockEnv = {} as any;
    const signaling = new SignalingDO(mockState, mockEnv);

    const sessionId = 'test-session-101';
    const peer1Messages: any[] = [];
    const peer2Messages: any[] = [];

    // Mock WebSockets
    const createMockWs = (inbox: any[]) => {
      const listeners: Record<string, Function[]> = {};
      return {
        readyState: 1, // OPEN
        send: vi.fn((data: string) => inbox.push(JSON.parse(data))),
        close: vi.fn(),
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        accept: vi.fn(),
        _triggerMessage: (data: any) => {
          listeners.message?.forEach((fn) => fn({ data: JSON.stringify(data) }));
        },
        _triggerClose: () => {
          listeners.close?.forEach((fn) => fn());
        },
      };
    };

    const ws1 = createMockWs(peer1Messages);
    const ws2 = createMockWs(peer2Messages);

    // 1. Both peers join the signaling session
    signaling.handleWebSocket(ws1 as any, 'user-alice', sessionId);
    signaling.handleWebSocket(ws2 as any, 'user-bob', sessionId);

    expect(signaling.peers.size).toBe(2);

    // 2. Alice sends SDP Offer -> should be forwarded to Bob
    ws1._triggerMessage({
      type: 'signal.offer',
      sessionId,
      sdp: 'v=0\r\no=alice 123 456...',
    });

    expect(peer2Messages.length).toBe(1);
    expect(peer2Messages[0]?.type).toBe('signal.offer');
    expect(peer2Messages[0]?.sdp).toContain('alice');

    // 3. Bob sends SDP Answer -> should be forwarded to Alice
    ws2._triggerMessage({
      type: 'signal.answer',
      sessionId,
      sdp: 'v=0\r\no=bob 789 101...',
    });

    expect(peer1Messages.length).toBe(1);
    expect(peer1Messages[0]?.type).toBe('signal.answer');
    expect(peer1Messages[0]?.sdp).toContain('bob');

    // 4. Alice sends Trickle ICE candidate -> should be forwarded to Bob
    ws1._triggerMessage({
      type: 'signal.ice',
      sessionId,
      candidate: {
        candidate: 'candidate:1 1 UDP 2122260223 192.168.1.100 50000 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      },
    });

    expect(peer2Messages.length).toBe(2);
    expect(peer2Messages[1]?.type).toBe('signal.ice');
    expect(peer2Messages[1]?.candidate?.candidate).toContain('192.168.1.100');

    // 5. Peer state update (connected)
    ws1._triggerMessage({
      type: 'peer.state',
      sessionId,
      state: 'connected',
    });

    expect(peer2Messages.length).toBe(3);
    expect(peer2Messages[2]?.type).toBe('peer.state');
    expect(peer2Messages[2]?.state).toBe('connected');

    // 6. Alice presses Next (match.next) -> Bob receives match.ended (peer_skipped) and session tears down
    ws1._triggerMessage({
      type: 'match.next',
      sessionId,
    });

    expect(peer2Messages.length).toBe(4);
    expect(peer2Messages[3]?.type).toBe('match.ended');
    expect(peer2Messages[3]?.reason).toBe('peer_skipped');

    // Session should be torn down and WebSockets closed
    expect(ws1.close).toHaveBeenCalled();
    expect(ws2.close).toHaveBeenCalled();
    expect(signaling.peers.size).toBe(0);
  });

  it('notifies remaining peer with peer_disconnected when a peer drops connection unexpectedly', () => {
    const mockState = {} as any;
    const mockEnv = {} as any;
    const signaling = new SignalingDO(mockState, mockEnv);

    const sessionId = 'test-session-102';
    const peer1Messages: any[] = [];
    const peer2Messages: any[] = [];

    const createMockWs = (inbox: any[]) => {
      const listeners: Record<string, Function[]> = {};
      return {
        readyState: 1,
        send: vi.fn((data: string) => inbox.push(JSON.parse(data))),
        close: vi.fn(),
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        accept: vi.fn(),
        _triggerClose: () => {
          listeners.close?.forEach((fn) => fn());
        },
      };
    };

    const ws1 = createMockWs(peer1Messages);
    const ws2 = createMockWs(peer2Messages);

    signaling.handleWebSocket(ws1 as any, 'user-alice', sessionId);
    signaling.handleWebSocket(ws2 as any, 'user-bob', sessionId);

    // Bob unexpectedly disconnects
    ws2._triggerClose();

    // Alice should receive match.ended with peer_disconnected
    expect(peer1Messages.length).toBe(1);
    expect(peer1Messages[0]?.type).toBe('match.ended');
    expect(peer1Messages[0]?.reason).toBe('peer_disconnected');
  });

  it('buffers offer and ICE candidates sent by peer 1 before peer 2 joins, and flushes upon peer 2 connection', () => {
    const mockState = {} as any;
    const mockEnv = {} as any;
    const signaling = new SignalingDO(mockState, mockEnv);

    const sessionId = 'test-session-race';
    const peer1Messages: any[] = [];
    const peer2Messages: any[] = [];

    const createMockWs = (inbox: any[]) => {
      const listeners: Record<string, Function[]> = {};
      return {
        readyState: 1,
        send: vi.fn((data: string) => inbox.push(JSON.parse(data))),
        close: vi.fn(),
        addEventListener: (event: string, fn: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        accept: vi.fn(),
        _triggerMessage: (data: any) => {
          listeners.message?.forEach((fn) => fn({ data: JSON.stringify(data) }));
        },
        _triggerClose: () => {
          listeners.close?.forEach((fn) => fn());
        },
      };
    };

    const ws1 = createMockWs(peer1Messages);
    const ws2 = createMockWs(peer2Messages);

    // Only Alice joins initially
    signaling.handleWebSocket(ws1 as any, 'user-alice', sessionId);

    // Alice sends Offer and ICE before Bob has joined
    ws1._triggerMessage({
      type: 'signal.offer',
      sessionId,
      sdp: 'offer-sdp-from-alice',
    });
    ws1._triggerMessage({
      type: 'signal.ice',
      sessionId,
      candidate: { candidate: 'cand-alice', sdpMid: '0', sdpMLineIndex: 0 },
    });

    // Bob has not joined yet, so 0 messages for Bob right now
    expect(peer2Messages.length).toBe(0);

    // Bob joins later
    signaling.handleWebSocket(ws2 as any, 'user-bob', sessionId);

    // Bob should immediately receive both buffered offer and ICE candidate!
    expect(peer2Messages.length).toBe(2);
    expect(peer2Messages[0]?.type).toBe('signal.offer');
    expect(peer2Messages[0]?.sdp).toBe('offer-sdp-from-alice');
    expect(peer2Messages[1]?.type).toBe('signal.ice');
    expect(peer2Messages[1]?.candidate?.candidate).toBe('cand-alice');
  });

  it('handles fetch() validations and WebSocket upgrades for SignalingDO', async () => {
    (globalThis as any).WebSocketPair = class {
      0: any;
      1: any;
      constructor() {
        this[0] = { accept: vi.fn(), send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
        this[1] = { accept: vi.fn(), send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() };
      }
    };

    const signaling = new SignalingDO({} as any, {} as any);

    // Missing query params
    const resNoParams = await signaling.fetch(new Request('http://localhost/api/ws/session'));
    expect(resNoParams.status).toBe(400);

    // Missing Upgrade header
    const resNoUpgrade = await signaling.fetch(
      new Request('http://localhost/api/ws/session?userId=u1&sessionId=s1')
    );
    expect(resNoUpgrade.status).toBe(426);

    // Valid upgrade 1
    const res1 = await signaling.fetch(
      new Request('http://localhost/api/ws/session?userId=u1&sessionId=s1', {
        headers: { Upgrade: 'websocket' },
      })
    );
    expect([101, 200]).toContain(res1.status);

    // Valid upgrade 2
    const res2 = await signaling.fetch(
      new Request('http://localhost/api/ws/session?userId=u2&sessionId=s1', {
        headers: { Upgrade: 'websocket' },
      })
    );
    expect([101, 200]).toContain(res2.status);

    // Session full (3rd peer rejected)
    const resFull = await signaling.fetch(
      new Request('http://localhost/api/ws/session?userId=u3&sessionId=s1', {
        headers: { Upgrade: 'websocket' },
      })
    );
    expect(resFull.status).toBe(403);
  });

  it('handles match.leave, invalid payload, and error events', () => {
    const signaling = new SignalingDO({} as any, {} as any);
    const peer1Messages: any[] = [];
    const peer2Messages: any[] = [];
    const listeners1: Record<string, Function[]> = {};

    const ws1 = {
      readyState: 1,
      send: vi.fn((data: string) => peer1Messages.push(JSON.parse(data))),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: (event: string, fn: Function) => {
        listeners1[event] = listeners1[event] || [];
        listeners1[event].push(fn);
      },
    } as any;

    const ws2 = {
      readyState: 1,
      send: vi.fn((data: string) => peer2Messages.push(JSON.parse(data))),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: vi.fn(),
    } as any;

    signaling.handleWebSocket(ws1, 'user-1', 's1');
    signaling.handleWebSocket(ws2, 'user-2', 's1');

    // Invalid payload
    listeners1.message?.forEach((fn) => fn({ data: JSON.stringify({ type: 'bogus' }) }));
    expect(peer1Messages.some((m) => m.type === 'error' && m.code === 'INVALID_PAYLOAD')).toBe(
      true
    );

    // match.leave
    listeners1.message?.forEach((fn) =>
      fn({ data: JSON.stringify({ type: 'match.leave', sessionId: 's1' }) })
    );
    expect(
      peer2Messages.some((m) => m.type === 'match.ended' && m.reason === 'peer_disconnected')
    ).toBe(true);

    // Socket error
    signaling.handleWebSocket(ws1, 'user-err', 's1');
    expect(signaling.peers.has('user-err')).toBe(true);
    listeners1.error?.forEach((fn) => fn());
    expect(signaling.peers.has('user-err')).toBe(false);
  });
});
