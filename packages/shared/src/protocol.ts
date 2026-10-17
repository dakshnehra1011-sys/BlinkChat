import { z } from 'zod';

export const iceCandidateSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

export type IceCandidatePayload = z.infer<typeof iceCandidateSchema>;

// Client -> Server messages
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('queue.join'),
  }),
  z.object({
    type: z.literal('queue.leave'),
  }),
  z.object({
    type: z.literal('signal.offer'),
    sessionId: z.string(),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('signal.answer'),
    sessionId: z.string(),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('signal.ice'),
    sessionId: z.string(),
    candidate: iceCandidateSchema,
  }),
  z.object({
    type: z.literal('peer.state'),
    sessionId: z.string(),
    state: z.enum(['connecting', 'connected', 'disconnected', 'failed', 'closed']),
  }),
  z.object({
    type: z.literal('match.next'),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('match.leave'),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('heartbeat'),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// Server -> Client messages
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('queue.status'),
    status: z.enum(['idle', 'queued', 'matching']),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('match.found'),
    sessionId: z.string(),
    peerId: z.string(),
    isInitiator: z.boolean(),
  }),
  z.object({
    type: z.literal('match.ended'),
    sessionId: z.string(),
    reason: z.enum(['peer_disconnected', 'peer_skipped', 'timeout', 'error']),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('signal.offer'),
    sessionId: z.string(),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('signal.answer'),
    sessionId: z.string(),
    sdp: z.string(),
  }),
  z.object({
    type: z.literal('signal.ice'),
    sessionId: z.string(),
    candidate: iceCandidateSchema,
  }),
  z.object({
    type: z.literal('peer.state'),
    sessionId: z.string(),
    state: z.enum(['connecting', 'connected', 'disconnected', 'failed', 'closed']),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('heartbeat_ack'),
  }),
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;

// RTCDataChannel Chat Message Schema (Strictly Peer-to-Peer, never stored on server)
export const dataChannelMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chat.message'),
    id: z.string(),
    senderId: z.string(),
    content: z.string().min(1).max(1000),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('chat.typing'),
    isTyping: z.boolean(),
  }),
]);

export type DataChannelMessage = z.infer<typeof dataChannelMessageSchema>;
