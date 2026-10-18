# BlinkChat ⚡

> Ultra-Low Latency Peer-to-Peer Random Video Chat Platform built on Cloudflare Workers, Durable Objects, D1, React, and WebRTC.

BlinkChat provides instant, privacy-conscious random stranger video calling with sub-100ms latency. All video, audio, and text chat travel strictly peer-to-peer over WebRTC `RTCDataChannel` and DTLS-SRTP, ensuring zero centralized chat logging and minimal bandwidth overhead.

---

## 🌟 Key Features

- **Ultra-Low Latency WebRTC**: Direct browser-to-browser media streaming with automatic STUN/TURN fallback.
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
└── pnpm-workspace.yaml
```

---

## 🚀 Quickstart Guide

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Run Local Development

In two separate terminals:

**Backend (Cloudflare Worker & Durable Objects):**

```bash
pnpm dev:worker
```

Worker starts at `http://localhost:8787` with local Miniflare D1 database and Durable Objects emulation.

**Frontend (React Web App):**

```bash
pnpm dev:web
```

Web app starts at `http://localhost:5173` with instant Vite HMR.

---

## 🧪 Testing & Quality Assurance

```bash
# Run unit & integration test suite (Vitest)
pnpm test

# Run strict TypeScript typecheck across all 4 packages
pnpm typecheck

# Build all packages for production
pnpm build
```

---

## 📖 Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Master Tech Stack Guide](TECH_STACK_AND_ARCHITECTURE.md)
- [Deployment & Cost Model](docs/DEPLOYMENT.md)
- [Agent Guidelines (AGENTS.md)](AGENTS.md)
- [Workspace & Tooling Audit](docs/WORKSPACE_AUDIT.md)
