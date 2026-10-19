# BlinkChat System Architecture

> 📘 **Detailed Guide**: For an exhaustive deep-dive explaining why every technology was selected, connectivity blueprints, and step-by-step functional workflows, see [TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md).

## Overview

BlinkChat is a one-to-one peer-to-peer video chat application. Workers and Durable Objects provide the control plane; media is intended to flow between browsers. Its latency and capacity have not been established by production load tests.

```
                      ┌──────────────────────┐
                      │   React + Vite SPA   │
                      │   (Cloudflare Pages) │
                      └──────────┬───────────┘
                                 │
                 HTTP / REST     │      WebSocket
            (Auth, Session, D1)  │  (Matchmaking & Signaling)
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │  Cloudflare Worker   │
                      │     (Hono API)       │
                      └────┬────────────┬────┘
                           │            │
            D1 Relational  │            │ RPC Binding
            Database       │            │
                           ▼            ▼
             ┌───────────────┐     ┌────────────────────────┐
             │ Cloudflare D1 │     │ Cloudflare DOs         │
             │ (SQLite Edge) │     ├────────────────────────┤
             └───────────────┘     │ • MatchmakerDO (Queue) │
                                   │ • SignalingDO (Session)│
                                   └────────────────────────┘
                                                │
                                                │ WebRTC SDP/ICE
                                                │ Signaling
                                                ▼
                                    ┌──────────────────────┐
                                    │    Direct Browser    │
                                    │      P2P WebRTC      │
                                    │  (Audio/Video + DC)  │
                                    └──────────────────────┘
```

## Core Components

### 1. Frontend (`apps/web`)

- **Framework**: React 19 / 18, Vite, TypeScript
- **Routing & State**: TanStack Router & TanStack Query
- **Styling**: Modern dark-mode-first CSS with CSS variables, responsive grid for video preview / remote call
- **Media Engine**: Custom WebRTC hook managing `RTCPeerConnection`, `MediaStream`, device discovery, track toggles, and connection health statistics
- **In-Call Chat**: `RTCDataChannel` abstraction with real-time text delivery and emoji integration (`emoji-picker-element`)

### 2. Backend API & WebSockets (`apps/worker`)

- **Runtime**: Cloudflare Workers
- **Router**: Hono
- **Authentication**: JWT/Bearer session tokens and password hashing with PBKDF2/WebCrypto (compatible with edge runtime)
- **Endpoints**:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `POST /api/reports`
  - `GET /api/ws/match` (WebSocket endpoint upgrading authenticated users and attaching to Durable Objects)

### 3. Matchmaking & Signaling (`Durable Objects`)

- **`MatchmakerDO`**:
  - Manages the waiting pool of authenticated users.
  - Guarantees no self-matching and evicts timed-out or disconnected clients.
  - When two peers are matched, generates a unique `sessionId` and forwards both peers to a dedicated `SignalingDO` instance.
- **`SignalingDO`**:
  - Coordinates the WebRTC handshake between the two peers for that specific session.
  - Forwards `signal.offer`, `signal.answer`, and `signal.ice`.
  - Handles the `Next` / `Leave` event by terminating the call and instructing the client to re-enter matchmaking or disconnect.

### 4. Database (`packages/database`)

- **Engine**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Tables**:
  - `users`: `id`, `email`, `password_hash`, `created_at`, `updated_at`
  - `sessions`: `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`
  - `reports`: `id`, `reporter_id`, `reported_peer_id`, `reason`, `created_at`
