# BlinkChat ⚡

> Ultra-Low Latency Peer-to-Peer Random Video Chat Platform built on Cloudflare Workers, Durable Objects, D1, React, and WebRTC.

BlinkChat uses WebRTC for one-to-one browser calls. Workers and Durable Objects handle authentication, matchmaking, and signaling; call media and in-call chat use the peer connection. Direct connectivity depends on both users' networks. TURN is not currently configured, so some restrictive networks may fail to connect. Latency and real two-peer connectivity need to be measured across real networks before making performance guarantees.

---

## 🌟 Key Features

- **WebRTC calls**: Direct browser-to-browser media when ICE can establish a peer path. TURN support is configurable but not active in the current deployment.
- **Edge Matchmaker (Durable Objects)**: Distributed FIFO queue actor (`MatchmakerDO`) preventing self-matches and duplicate entries.
- **Dedicated Signaling Rooms (`SignalingDO`)**: Ephemeral Durable Object session instances coordinating SDP Offer/Answer and Trickle ICE candidate forwarding.
- **Zero-Logging P2P Chat**: Live text and emoji messaging powered by WebRTC `RTCDataChannel`. Never stored in any database.
- **Edge Auth & D1 Relational Storage**: Email verification flow, PBKDF2 password hashing with WebCrypto, session signing, and abuse reporting.
- **Modern Responsive Dark Interface**: Mirrored floating self-preview, fullscreen remote video, in-call overlay controls, and accessible keyboard shortcuts.

---

## 🏗️ Monorepo Architecture

```
WebPlateform/
├── apps/
│   ├── web/                     # React 18 + Vite + WebRTC client + Dark Theme UI
│   └── worker/                  # Cloudflare Worker + Hono API + Durable Objects (Matchmaker & Signaling)
├── packages/
│   ├── shared/                  # Shared Zod schemas, protocol events, and TypeScript interfaces
│   └── database/                # Drizzle ORM schema, SQL migrations for Cloudflare D1
├── tests/                       # Vitest test suite for protocol, crypto, and queue invariants
├── docs/                        # Architecture, deployment guide, and tooling specifications
└── bun.lock
```

---

## 🚀 Quickstart Guide

### 1. Install Dependencies

```bash
bun install
```

### 2. Run Local Development

In two separate terminals:

**Backend (Cloudflare Worker & Durable Objects):**

```bash
bun run dev:worker
```

Worker starts at `http://localhost:8787` with local Miniflare D1 database and Durable Objects emulation.

**Frontend (React Web App):**

```bash
bun run dev:web
```

Web app starts at `http://localhost:5173` with instant Vite HMR.

---

## 🧪 Testing & Quality Assurance

```bash
# Run unit & integration test suite (Vitest)
bun run test

# Run strict TypeScript typecheck across all 4 packages
bun run typecheck

# Build all packages for production
bun run build
```

---

## 📖 Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Real-time media options and connectivity limits](docs/REALTIME_OPTIONS.md)
- [Master Tech Stack Guide](TECH_STACK_AND_ARCHITECTURE.md)
- [Deployment & Cost Model](docs/DEPLOYMENT.md)
- [Agent Guidelines (AGENTS.md)](AGENTS.md)
- [Workspace & Tooling Audit](docs/WORKSPACE_AUDIT.md)
