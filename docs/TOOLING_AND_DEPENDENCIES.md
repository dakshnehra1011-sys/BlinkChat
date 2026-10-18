# Tooling and Dependencies

## 1. Monorepo Architecture

- **Runtime / Package Manager**: Bun 1.4.3 manages dependencies and scripts; Cloudflare Workers execute on Cloudflare's runtime.
- **Node Compatibility**: Node.js-compatible tooling is used for Vite, Wrangler, and CI actions.
- **TypeScript**: Strict configuration (`tsconfig.base.json` across packages)
- **Monorepo Structure**:
  - `apps/web`: React 19 / 18, Vite, TanStack Router, TanStack Query, Tailwind CSS / Vanilla CSS dark system, Lucide icons, `emoji-picker-element`
  - `apps/worker`: Cloudflare Worker, Hono HTTP API, WebSockets, Durable Objects (Matchmaker & SignalingRoom)
  - `packages/shared`: Shared TypeScript types, Zod schemas, protocol definitions, error codes
  - `packages/database`: D1 SQLite schema, Drizzle ORM, migrations

## 2. Cloudflare Stack

- **Cloudflare Workers**: Edge API gateway and WebSocket server
- **Cloudflare Durable Objects**: Distributed stateful actors for:
  - `MatchmakerDO`: Queue management, pairing algorithm, deduplication, timeout handling
  - `SignalingDO`: Ephemeral WebRTC session coordination, offer/answer exchange, ICE relay, participant verification
- **Cloudflare D1**: Distributed SQLite relational database for users, sessions, verification tokens, reports, blocks
- **Drizzle ORM & Drizzle Kit**: Type-safe schema definition and migration manager
- **Local Emulator**: Wrangler / Miniflare

## 3. WebRTC & Real-time Protocols

- **Media**: Native Browser `navigator.mediaDevices.getUserMedia`, `RTCPeerConnection`, `MediaStream`
- **Signaling**: Authenticated WebSocket duplex connection with structured JSON message types:
  - `queue.join`, `queue.leave`, `match.found`, `match.ended`
  - `signal.offer`, `signal.answer`, `signal.ice`
  - `peer.state`, `heartbeat`, `error`
- **P2P Data Channel**: `RTCDataChannel` (label: `blinkchat-chat`, ordered, reliable) for direct peer text and emoji transmission
- **ICE / TURN Strategy**:
  - Default: STUN servers (`stun:stun.l.google.com:19302`, `stun:stun1.l.google.com:19302`)
  - Optional fallback: Short-lived Cloudflare Realtime TURN credentials, Metered credentials, or static TURN credentials. TURN relays media and is not a direct peer connection.
  - Current deployment status: no TURN credentials are configured (`turnAvailable: false`), so users whose NAT/firewall blocks direct ICE paths may fail to connect.

## 4. Testing & Code Quality

- **Unit & Integration**: Vitest with node/jsdom environments
- **End-to-End**: Playwright covers browser UI and responsive layouts with mocked media; it does not currently prove a real two-peer WebRTC call.
- **Linting & Formatting**: Biome or ESLint / Prettier
- **Continuous Integration**: GitHub Actions workflow running lint, types, unit tests, coverage, and build checks
