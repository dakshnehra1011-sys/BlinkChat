import { describe, expect, it } from 'vitest';
import {
  clientMessageSchema,
  dataChannelMessageSchema,
  registerSchema,
  reportSchema,
  serverMessageSchema,
} from '../packages/shared/src/index.js';

describe('Shared Protocol & Schema Suite', () => {
  describe('Authentication Schemas', () => {
    it('validates a correct registration payload', () => {
      const valid = { email: 'alice@blinkchat.io', password: 'securepassword123' };
      const res = registerSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects short passwords', () => {
      const invalid = { email: 'alice@blinkchat.io', password: 'short' };
      const res = registerSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('rejects invalid email formats', () => {
      const invalid = { email: 'not-an-email', password: 'securepassword123' };
      const res = registerSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('validates a report payload with valid category', () => {
      const report = {
        reportedUserId: 'user-xyz',
        reason: 'harassment_or_hate_speech',
        notes: 'User was using hate speech',
      };
      const res = reportSchema.safeParse(report);
      expect(res.success).toBe(true);
    });
  });

  describe('WebSocket Client Messages', () => {
    it('parses queue.join and queue.leave', () => {
      expect(clientMessageSchema.safeParse({ type: 'queue.join' }).success).toBe(true);
      expect(clientMessageSchema.safeParse({ type: 'queue.leave' }).success).toBe(true);
    });

    it('parses signal.offer with valid SDP', () => {
      const offer = {
        type: 'signal.offer',
        sessionId: 'session-123',
        sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1...',
      };
      const res = clientMessageSchema.safeParse(offer);
      expect(res.success).toBe(true);
    });

    it('parses signal.ice with candidate payload', () => {
      const ice = {
        type: 'signal.ice',
        sessionId: 'session-123',
        candidate: {
          candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      };
      const res = clientMessageSchema.safeParse(ice);
      expect(res.success).toBe(true);
    });

    it('rejects malformed messages', () => {
      const malformed = { type: 'unknown_action', foo: 'bar' };
      expect(clientMessageSchema.safeParse(malformed).success).toBe(false);
    });
  });

  describe('WebSocket Server Messages', () => {
    it('parses match.found message', () => {
      const match = {
        type: 'match.found',
        sessionId: 'session-abc',
        peerId: 'peer-xyz',
        isInitiator: true,
      };
      const res = serverMessageSchema.safeParse(match);
      expect(res.success).toBe(true);
    });

    it('parses match.ended message with valid reason', () => {
      const ended = {
        type: 'match.ended',
        sessionId: 'session-abc',
        reason: 'peer_skipped',
        message: 'Stranger skipped',
      };
      const res = serverMessageSchema.safeParse(ended);
      expect(res.success).toBe(true);
    });
  });

  describe('P2P RTCDataChannel Chat Protocol', () => {
    it('parses valid chat.message', () => {
      const chat = {
        type: 'chat.message',
        id: 'msg-1',
        senderId: 'user-1',
        content: 'Hello stranger! 👋',
        timestamp: Date.now(),
      };
      const res = dataChannelMessageSchema.safeParse(chat);
      expect(res.success).toBe(true);
    });

    it('rejects empty chat messages', () => {
      const empty = {
        type: 'chat.message',
        id: 'msg-1',
        senderId: 'user-1',
        content: '',
        timestamp: Date.now(),
      };
      expect(dataChannelMessageSchema.safeParse(empty).success).toBe(false);
    });
  });
});
