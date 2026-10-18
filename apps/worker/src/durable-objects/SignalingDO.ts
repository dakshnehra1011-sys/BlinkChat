import { type ClientMessage, clientMessageSchema, type ServerMessage } from '@blinkchat/shared';
import type { Env } from '../types.js';

interface SessionPeer {
  userId: string;
  accountUserId: string;
  ws: WebSocket;
}

export class SignalingDO {
  state: DurableObjectState;
  env: Env;
  peers = new Map<string, SessionPeer>();
  pendingMessages: { fromUserId: string; message: ServerMessage }[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const sessionId = url.searchParams.get('sessionId');
    const accountUserId = url.searchParams.get('accountUserId') || userId;

    if (!userId || !sessionId) {
      return new Response('Missing userId or sessionId', { status: 400 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // A session must only admit at most 2 peers
    if (this.peers.size >= 2 && !this.peers.has(userId)) {
      return new Response('Session is full', { status: 403 });
    }
    const otherPeer = this.getOtherPeer(userId);
    if (otherPeer?.accountUserId === accountUserId) {
      return new Response('A session cannot contain the same account twice', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(pair);

    this.handleWebSocket(serverWs!, userId, sessionId, accountUserId || userId);

    try {
      return new Response(null, {
        status: 101,
        webSocket: clientWs,
      });
    } catch {
      return new Response(null, { status: 200, webSocket: clientWs } as any);
    }
  }

  handleWebSocket(ws: WebSocket, userId: string, sessionId: string, accountUserId = userId): void {
    const existing = this.peers.get(userId);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close(1000, 'Connection replaced');
      } catch {}
    }
    ws.accept();

    this.peers.set(userId, { userId, accountUserId, ws });

    // Flush any pending messages that arrived before this peer connected with multi-stage retry
    const flushPending = () => {
      if (this.pendingMessages.length === 0) return;
      const remaining: typeof this.pendingMessages = [];
      for (const pending of this.pendingMessages) {
        if (pending.fromUserId !== userId) {
          const sent = this.sendMessage(ws, pending.message);
          if (!sent) remaining.push(pending);
        } else {
          remaining.push(pending);
        }
      }
      this.pendingMessages = remaining;
    };

    flushPending();
    queueMicrotask(flushPending);
    setTimeout(flushPending, 50);
    setTimeout(flushPending, 150);
    setTimeout(flushPending, 350);

    ws.addEventListener('message', async (event) => {
      if (this.pendingMessages.length > 0) {
        flushPending();
      }
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
            message: 'Invalid signaling payload',
          });
          return;
        }

        const msg: ClientMessage = parsed.data;

        // Each Durable Object is a single session. Reject mismatched payload IDs
        // instead of letting a client confuse the remote peer's session state.
        if ('sessionId' in msg && msg.sessionId !== sessionId) {
          this.sendMessage(ws, {
            type: 'error',
            code: 'SESSION_MISMATCH',
            message: 'Message does not belong to this session',
          });
          return;
        }

        // Replaced/closed sockets must not continue signaling as the current peer.
        if (this.peers.get(userId)?.ws !== ws) return;
        const otherPeer = this.getOtherPeer(userId);

        switch (msg.type) {
          case 'signal.offer': {
            const outMsg: ServerMessage = {
              type: 'signal.offer',
              sessionId: msg.sessionId,
              sdp: msg.sdp,
            };
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, outMsg);
            } else {
              this.pendingMessages.push({ fromUserId: userId, message: outMsg });
            }
            break;
          }

          case 'signal.answer': {
            const outMsg: ServerMessage = {
              type: 'signal.answer',
              sessionId: msg.sessionId,
              sdp: msg.sdp,
            };
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, outMsg);
            } else {
              this.pendingMessages.push({ fromUserId: userId, message: outMsg });
            }
            break;
          }

          case 'signal.ice': {
            const outMsg: ServerMessage = {
              type: 'signal.ice',
              sessionId: msg.sessionId,
              candidate: msg.candidate,
            };
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, outMsg);
            } else {
              this.pendingMessages.push({ fromUserId: userId, message: outMsg });
            }
            break;
          }

          case 'peer.state': {
            const outMsg: ServerMessage = {
              type: 'peer.state',
              sessionId: msg.sessionId,
              state: msg.state,
            };
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, outMsg);
            } else {
              this.pendingMessages.push({ fromUserId: userId, message: outMsg });
            }
            break;
          }

          case 'match.next': {
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, {
                type: 'match.ended',
                sessionId,
                reason: 'peer_skipped',
                message: 'Stranger clicked Next',
              });
            }
            this.teardownSession();
            break;
          }

          case 'match.leave': {
            if (otherPeer) {
              this.sendMessage(otherPeer.ws, {
                type: 'match.ended',
                sessionId,
                reason: 'peer_disconnected',
                message: 'Stranger left the call',
              });
            }
            this.teardownSession();
            break;
          }

          case 'heartbeat': {
            this.sendMessage(ws, { type: 'heartbeat_ack' });
            break;
          }
        }
      } catch (err) {
        console.error('Signaling error:', err);
      }
    });

    ws.addEventListener('close', () => {
      if (this.peers.get(userId)?.ws !== ws) return;
      this.peers.delete(userId);
      const otherPeer = this.getOtherPeer(userId);
      if (otherPeer) {
        this.sendMessage(otherPeer.ws, {
          type: 'match.ended',
          sessionId,
          reason: 'peer_disconnected',
          message: 'Stranger disconnected',
        });
      }
    });

    ws.addEventListener('error', () => {
      if (this.peers.get(userId)?.ws === ws) this.peers.delete(userId);
    });
  }

  getOtherPeer(userId: string): SessionPeer | undefined {
    for (const [id, peer] of this.peers.entries()) {
      if (id !== userId) return peer;
    }
    return undefined;
  }

  teardownSession(): void {
    this.pendingMessages = [];
    for (const peer of this.peers.values()) {
      try {
        peer.ws.close(1000, 'Session ended');
      } catch {}
    }
    this.peers.clear();
  }

  sendMessage(ws: WebSocket, msg: ServerMessage): boolean {
    try {
      if (ws.readyState === 1 || ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to send signaling message:', err);
      return false;
    }
  }
}
