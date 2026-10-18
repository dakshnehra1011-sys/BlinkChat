# Project Guidelines for BlinkChat

This repository houses **BlinkChat**, a production-oriented, privacy-preserving, ultra-low latency peer-to-peer random video chat platform built on Cloudflare Workers, Durable Objects, D1, React, and WebRTC.

## 1. Architectural Boundaries

- `apps/web`: React client interface. Never import node or worker-only libraries here. Only use browser-safe WebRTC, TanStack Router/Query, and native DOM APIs.
- `apps/worker`: Hono HTTP endpoints and Durable Objects (`MatchmakerDO`, `SignalingDO`). Strictly stateless Worker handlers; all coordinated state belongs in Durable Objects.
- `packages/shared`: Shared types, protocol schemas (Zod), and message interfaces. Both client and worker must consume these contracts.
- `packages/database`: Drizzle ORM schema for Cloudflare D1. Migrations must be committed and deterministic.

## 2. Test-Driven Development (TDD)

- All domain logic, authentication flows, matchmaking queue transitions, and signaling message validations must have corresponding Vitest tests.
- Write regression tests before implementation changes. Keep unit/integration tests in `tests/` and real browser E2E tests in `e2e/`.
- E2E coverage must exercise the app through the local Worker/D1 stack. For call changes, cover multiple peers, received media, and RTCDataChannel chat.
- CI enforces >90% aggregate coverage for statements, branches, functions, and lines with `bun run test:coverage`.
- Run browser E2E via `bun run db:migrate:local` followed by `bun run test:e2e`.
- Run `bun run lint`, `bun run format:check`, `bun run typecheck`, and `bun run build` before handing changes off.
- Production deployment and remote D1 migrations happen only through the GitHub Actions workflow after validation succeeds.
- Do not bypass tests or leave non-functional placeholders.

## 3. Security & Privacy Guardrails

- **No Chat Logging**: In-call text messages travel strictly via WebRTC `RTCDataChannel`. Never persist or route live P2P chat messages through the database or server logs.
- **No Secret Leaks**: Never hardcode TURN secrets, JWT signing keys, or credentials into client bundles or git. Use Worker environment bindings (`c.env`).
- **Authorization**: Every WebSocket upgrade and signaling message must be cryptographically verified against the authenticated user session.

## 4. Key Commands

- Install: `bun install`
- Dev (Worker): `bun run dev:worker`
- Dev (Web): `bun run dev:web`
- Build: `bun run build`
- Test: `bun run test`
- Typecheck: `bun run typecheck`
