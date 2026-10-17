# Project Guidelines for BlinkChat

This repository houses **BlinkChat**, a production-oriented, privacy-preserving, ultra-low latency peer-to-peer random video chat platform built on Cloudflare Workers, Durable Objects, D1, React, and WebRTC.

## 1. Architectural Boundaries

- `apps/web`: React client interface. Never import node or worker-only libraries here. Only use browser-safe WebRTC, TanStack Router/Query, and native DOM APIs.
- `apps/worker`: Hono HTTP endpoints and Durable Objects (`MatchmakerDO`, `SignalingDO`). Strictly stateless Worker handlers; all coordinated state belongs in Durable Objects.
- `packages/shared`: Shared types, protocol schemas (Zod), and message interfaces. Both client and worker must consume these contracts.
- `packages/database`: Drizzle ORM schema for Cloudflare D1. Migrations must be committed and deterministic.

## 2. Test-Driven Development (TDD)

- All domain logic, authentication flows, matchmaking queue transitions, and signaling message validations must have corresponding Vitest tests.
- Run tests via `pnpm test`.
- Do not bypass tests or leave non-functional placeholders.

## 3. Security & Privacy Guardrails

- **No Chat Logging**: In-call text messages travel strictly via WebRTC `RTCDataChannel`. Never persist or route live P2P chat messages through the database or server logs.
- **No Secret Leaks**: Never hardcode TURN secrets, JWT signing keys, or credentials into client bundles or git. Use Worker environment bindings (`c.env`).
- **Authorization**: Every WebSocket upgrade and signaling message must be cryptographically verified against the authenticated user session.

## 4. Key Commands

- Install: `pnpm install`
- Dev (Worker): `pnpm --filter worker dev`
- Dev (Web): `pnpm --filter web dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
