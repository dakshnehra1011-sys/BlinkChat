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
    matchmaker.userSocketMap.set('user-1', ws1);
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
    matchmaker.userSocketMap.set('user-2', ws2);
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
    const listeners1: Record<string, ((...args: any[]) => void)[]> = {};

    const ws1 = {
      readyState: 1,
      send: vi.fn((data: string) => inbox1.push(JSON.parse(data))),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: (event: string, fn: (...args: any[]) => void) => {
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

    const listeners2: Record<string, ((...args: any[]) => void)[]> = {};
    const ws2 = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: (event: string, fn: (...args: any[]) => void) => {
        listeners2[event] = listeners2[event] || [];
        listeners2[event]!.push(fn);
      },
    } as any;

    matchmaker.handleWebSocket(ws2, 'user-alice');
    expect(ws1.close).toHaveBeenCalledWith(1000, 'Duplicate connection replaced');

    // A stale socket closing must not remove its replacement.
    listeners1.close?.forEach((fn) => fn());
    expect(matchmaker.userSocketMap.get('user-alice')).toBe(ws2);
    listeners2.close?.forEach((fn) => fn());
    expect(matchmaker.userSocketMap.has('user-alice')).toBe(false);

    // Test socket error event cleans up queue and map
    const listeners3: Record<string, ((...args: any[]) => void)[]> = {};
    const ws3 = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
      accept: vi.fn(),
      addEventListener: (event: string, fn: (...args: any[]) => void) => {
        listeners3[event] = listeners3[event] || [];
        listeners3[event]!.push(fn);
      },
    } as any;
    matchmaker.handleWebSocket(ws3, 'user-carol');
    expect(matchmaker.userSocketMap.has('user-carol')).toBe(true);
    listeners3.error?.forEach((fn) => fn());
    expect(matchmaker.userSocketMap.has('user-carol')).toBe(false);
  });

  it('does not self-match separate tabs and purges closed or replaced sockets', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const createSocket = () =>
      ({
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        accept: vi.fn(),
        addEventListener: vi.fn(),
      }) as any;
    const tabOne = createSocket();
    const tabTwo = createSocket();
    const otherAccount = createSocket();
    const deadSocket = createSocket();
    deadSocket.readyState = 3;
    matchmaker.userSocketMap.set('alice-tab-one', tabOne);
    matchmaker.userSocketMap.set('alice-tab-two', tabTwo);
    matchmaker.userSocketMap.set('bob-tab-one', otherAccount);
    matchmaker.userSocketMap.set('dead', deadSocket);
    matchmaker.addToQueue('alice-tab-one', tabOne, 'alice');
    matchmaker.addToQueue('alice-tab-two', tabTwo, 'alice');
    matchmaker.addToQueue('bob-tab-one', otherAccount, 'bob');
    matchmaker.addToQueue('dead', deadSocket, 'dead');
    matchmaker.tryMatch();

    expect(deadSocket.send).not.toHaveBeenCalled();
    const matchOne = JSON.parse(tabOne.send.mock.calls[1]![0]);
    const matchBob = JSON.parse(otherAccount.send.mock.calls[1]![0]);
    expect(matchOne.type).toBe('match.found');
    expect(matchBob.type).toBe('match.found');
    expect(matchOne.peerId).toBe('bob-tab-one');
    expect(matchTwoIsQueued()).toBe(true);

    function matchTwoIsQueued() {
      return matchmaker.queue.some((entry) => entry.userId === 'alice-tab-two');
    }
  });

  it('does not let an old socket close remove its replacement from the queue', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const listeners = new Map<any, Record<string, ((...args: any[]) => void)[]>>();
    const createSocket = () => {
      const socketListeners: Record<string, ((...args: any[]) => void)[]> = {};
      const socket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        accept: vi.fn(),
        addEventListener: (event: string, fn: (...args: any[]) => void) => {
          socketListeners[event] = socketListeners[event] || [];
          socketListeners[event]!.push(fn);
        },
      } as any;
      listeners.set(socket, socketListeners);
      return socket;
    };
    const oldSocket = createSocket();
    const replacement = createSocket();
    matchmaker.handleWebSocket(oldSocket, 'client-1', 'account-1');
    matchmaker.addToQueue('client-1', oldSocket, 'account-1');
    matchmaker.handleWebSocket(replacement, 'client-1', 'account-1');
    matchmaker.addToQueue('client-1', replacement, 'account-1');

    listeners.get(oldSocket)?.close?.forEach((fn) => fn());

    expect(matchmaker.userSocketMap.get('client-1')).toBe(replacement);
    expect(matchmaker.queue).toHaveLength(1);
    expect(matchmaker.queue[0]?.ws).toBe(replacement);
  });

  it('pairs several distinct users into isolated sessions in one queue pass', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const peers = Array.from({ length: 6 }, (_, index) => {
      const inbox: any[] = [];
      const ws = {
        readyState: 1,
        send: vi.fn((data: string) => inbox.push(JSON.parse(data))),
        close: vi.fn(),
      } as any;
      const userId = `client-${index}`;
      const accountUserId = `account-${index}`;
      matchmaker.userSocketMap.set(userId, ws);
      matchmaker.addToQueue(userId, ws, accountUserId);
      return { userId, inbox };
    });

    matchmaker.tryMatch();

    expect(matchmaker.queue).toHaveLength(0);
    const matches = peers.map(({ inbox }) =>
      inbox.find((message) => message.type === 'match.found')
    );
    expect(matches.every(Boolean)).toBe(true);
    const sessions = new Set(matches.map((message) => message.sessionId));
    expect(sessions).toHaveLength(3);
    for (const match of matches) {
      const reciprocal = matches.find(
        (candidate) => candidate.peerId === peers[matches.indexOf(match)]?.userId
      );
      expect(reciprocal?.sessionId).toBe(match.sessionId);
    }
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

  it('ignores stale queue commands, acknowledges leave and heartbeat, and handles malformed frames', async () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const listeners = new Map<any, Record<string, ((event?: any) => void)[]>>();
    const createSocket = () => {
      const events: Record<string, ((event?: any) => void)[]> = {};
      const socket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        accept: vi.fn(),
        addEventListener: (event: string, fn: (event?: any) => void) => {
          events[event] = [...(events[event] ?? []), fn];
        },
      };
      listeners.set(socket, events);
      return socket as any;
    };
    const oldSocket = createSocket();
    const currentSocket = createSocket();
    matchmaker.handleWebSocket(oldSocket, 'same-client');
    matchmaker.handleWebSocket(currentSocket, 'same-client');

    const trigger = (socket: any, data: string | ArrayBuffer) =>
      listeners.get(socket)?.message?.forEach((listener) => listener({ data }));
    trigger(oldSocket, JSON.stringify({ type: 'queue.join' }));
    expect(matchmaker.queue).toHaveLength(0);
    trigger(currentSocket, JSON.stringify({ type: 'queue.join' }));
    trigger(
      currentSocket,
      new TextEncoder().encode(JSON.stringify({ type: 'queue.leave' })).buffer
    );
    expect(matchmaker.queue).toHaveLength(0);
    expect(currentSocket.send).toHaveBeenCalledWith(expect.stringContaining('"status":"idle"'));
    trigger(currentSocket, JSON.stringify({ type: 'heartbeat' }));
    expect(currentSocket.send).toHaveBeenCalledWith(expect.stringContaining('heartbeat_ack'));
    trigger(currentSocket, '{not-json');
    trigger(currentSocket, JSON.stringify({ type: 'not-a-protocol-message' }));
    expect(currentSocket.send).toHaveBeenCalledWith(expect.stringContaining('INVALID_PAYLOAD'));
  });

  it('recovers queue entries when match notifications fail and filters disconnected peers', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const createSocket = (send = vi.fn()) => ({ readyState: 1, send, close: vi.fn() }) as any;
    const aSend = vi.fn(() => {
      throw new Error('socket send failed');
    });
    const a = createSocket(aSend);
    const b = createSocket();
    matchmaker.userSocketMap.set('a', a);
    matchmaker.userSocketMap.set('b', b);
    matchmaker.addToQueue('a', a);
    matchmaker.addToQueue('b', b);
    matchmaker.tryMatch();
    expect(matchmaker.userSocketMap.has('a')).toBe(false);
    expect(matchmaker.queue.map((entry) => entry.userId)).toEqual(['b']);
    matchmaker.removeFromQueue('b');

    const c = createSocket();
    const d = createSocket(
      vi.fn(() => {
        throw new Error('peer send failed');
      })
    );
    matchmaker.userSocketMap.set('c', c);
    matchmaker.userSocketMap.set('d', d);
    matchmaker.userSocketMap.set('c', c);
    matchmaker.userSocketMap.set('d', d);
    matchmaker.addToQueue('c', c);
    matchmaker.addToQueue('d', d);
    matchmaker.tryMatch();
    expect(matchmaker.userSocketMap.has('d')).toBe(false);
    expect(matchmaker.queue.map((entry) => entry.userId)).toEqual(['c']);

    const closed = createSocket();
    closed.readyState = 3;
    const replaced = createSocket();
    matchmaker.userSocketMap.set('closed', replaced);
    matchmaker.addToQueue('closed', closed);
    matchmaker.tryMatch();
    expect(matchmaker.queue.every((entry) => entry.ws.readyState === 1)).toBe(true);
  });

  it('keeps same-account tabs queued and drops sockets whose readiness check throws', () => {
    const matchmaker = new MatchmakerDO({} as any, {} as any);
    const first = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as any;
    const second = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as any;
    const broken = {
      get readyState(): never {
        throw new Error('socket state is unavailable');
      },
      send: vi.fn(),
      close: vi.fn(),
    } as any;
    matchmaker.userSocketMap.set('tab-a', first);
    matchmaker.userSocketMap.set('tab-b', second);
    matchmaker.userSocketMap.set('broken', broken);
    matchmaker.addToQueue('tab-a', first, 'same-account');
    matchmaker.addToQueue('tab-b', second, 'same-account');
    matchmaker.addToQueue('broken', broken, 'another-account');

    matchmaker.tryMatch();

    expect(matchmaker.queue.map((entry) => entry.userId)).toEqual(['tab-a', 'tab-b']);
    expect(first.send).not.toHaveBeenCalledWith(expect.stringContaining('match.found'));
  });
});
