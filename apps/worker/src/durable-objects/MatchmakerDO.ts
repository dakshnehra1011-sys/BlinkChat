import { type ClientMessage, clientMessageSchema, type ServerMessage } from '@blinkchat/shared';
import type { Env } from '../types.js';

interface QueuedUser {
  // userId is the per-tab client ID; accountUserId prevents self-matches across tabs.
  userId: string;
  accountUserId: string;
  ws: WebSocket;
  joinedAt: number;
}

export class MatchmakerDO {
  state: DurableObjectState;
  env: Env;
  queue: QueuedUser[] = [];
  userSocketMap = new Map<string, WebSocket>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const accountUserId = url.searchParams.get('accountUserId') || userId;

    if (!userId) {
      return new Response('Missing userId', { status: 400 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);

    this.handleWebSocket(serverWs!, userId, accountUserId || userId);

    try {
      return new Response(null, {
        status: 101,
        webSocket: clientWs,
      });
    } catch {
      return new Response(null, { status: 200, webSocket: clientWs } as any);
    }
  }

  handleWebSocket(ws: WebSocket, userId: string, accountUserId = userId): void {
    ws.accept();

    // Evict any existing socket for this user (prevent duplicate queue presence)
    const existingWs = this.userSocketMap.get(userId);
    if (existingWs) {
      try {
        existingWs.close(1000, 'Duplicate connection replaced');
      } catch {}
      this.removeFromQueue(userId);
    }

    this.userSocketMap.set(userId, ws);

    ws.addEventListener('message', async (event) => {
      try {
        const raw =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        const data = JSON.parse(raw);
        const parsed = clientMessageSchema.safeParse(data);

        if (!parsed.success) {
          this.sendMessage(ws, {
            type: 'error',
            code: 'INVALID_PAYLOAD',
            message: 'Invalid protocol payload',
          });
          return;
        }

        const msg: ClientMessage = parsed.data;

        switch (msg.type) {
          case 'queue.join': {
            if (this.userSocketMap.get(userId) !== ws) return;
            this.addToQueue(userId, ws, accountUserId);
            this.tryMatch();
            break;
          }
          case 'queue.leave': {
            if (this.userSocketMap.get(userId) !== ws) return;
            this.removeFromQueue(userId);
            this.sendMessage(ws, { type: 'queue.status', status: 'idle' });
            break;
          }
          case 'heartbeat': {
            this.sendMessage(ws, { type: 'heartbeat_ack' });
            this.tryMatch();
            break;
          }
        }
      } catch (err) {
        console.error('Error processing matchmaker message:', err);
      }
    });

    ws.addEventListener('close', () => {
      // A replaced socket may close after its replacement has already joined.
      if (this.userSocketMap.get(userId) === ws) {
        this.removeFromQueue(userId);
        this.userSocketMap.delete(userId);
      }
    });

    ws.addEventListener('error', () => {
      if (this.userSocketMap.get(userId) === ws) {
        this.removeFromQueue(userId);
        this.userSocketMap.delete(userId);
      }
    });
  }

  addToQueue(userId: string, ws: WebSocket, accountUserId = userId): void {
    this.removeFromQueue(userId);
    this.queue.push({
      userId,
      accountUserId,
      ws,
      joinedAt: Date.now(),
    });

    this.sendMessage(ws, {
      type: 'queue.status',
      status: 'queued',
      message: 'Looking for a stranger...',
    });
  }

  removeFromQueue(userId: string): void {
    this.queue = this.queue.filter((item) => item.userId !== userId);
  }

  tryMatch(): void {
    // Purge disconnected sockets
    this.queue = this.queue.filter((item) => {
      try {
        return (
          item.ws.readyState === WebSocket.OPEN && this.userSocketMap.get(item.userId) === item.ws
        );
      } catch {
        return false;
      }
    });

    while (this.queue.length >= 2) {
      const peer1 = this.queue[0];
      if (!peer1) break;

      const peer2Index = this.queue.findIndex(
        (p, idx) => idx > 0 && p.accountUserId !== peer1.accountUserId
      );

      // If no candidate with a different userId is found, we cannot form a match yet
      if (peer2Index === -1) {
        break;
      }

      const [peer2] = this.queue.splice(peer2Index, 1);
      this.queue.shift(); // remove peer1

      if (!peer1 || !peer2) break;

      const sessionId = crypto.randomUUID();

      // Notify peer 1 (Initiator: creates offer)
      const peer1Sent = this.sendMessage(peer1.ws, {
        type: 'match.found',
        sessionId,
        peerId: peer2.userId,
        isInitiator: true,
      });

      // Notify peer 2 (Receiver: waits for offer)
      const peer2Sent = this.sendMessage(peer2.ws, {
        type: 'match.found',
        sessionId,
        peerId: peer1.userId,
        isInitiator: false,
      });

      // Never strand a client in a session if either match notification failed.
      if (!peer1Sent || !peer2Sent) {
        if (!peer1Sent && this.userSocketMap.get(peer1.userId) === peer1.ws) {
          this.userSocketMap.delete(peer1.userId);
        } else if (peer1Sent && peer1.ws.readyState === WebSocket.OPEN) {
          this.queue.unshift({ ...peer1, joinedAt: Date.now() });
        }
        if (!peer2Sent && this.userSocketMap.get(peer2.userId) === peer2.ws) {
          this.userSocketMap.delete(peer2.userId);
        } else if (peer2Sent && peer2.ws.readyState === WebSocket.OPEN) {
          this.queue.unshift({ ...peer2, joinedAt: Date.now() });
        }
      }
    }
  }

  sendMessage(ws: WebSocket, msg: ServerMessage): boolean {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
    return false;
  }
}
