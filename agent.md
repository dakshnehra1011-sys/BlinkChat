# Agent Harness Guidelines for BlinkChat

This repository houses **BlinkChat**, a 100% serverless, privacy-preserving, ultra-low latency peer-to-peer random video chat platform built on Cloudflare Workers, Durable Objects, D1, React, and WebRTC.

## 1. Core Architecture & Stack

- **Frontend**: React 18, TypeScript, TanStack Query, TanStack Router.
- **Backend/API**: Hono v4 on Cloudflare Workers.
- **State Management**: Cloudflare Durable Objects (`MatchmakerDO` for FIFO queue, `SignalingDO` for ephemeral rooms).
- **Database & ORM**: Cloudflare D1 with Drizzle ORM.
- **Real-Time Engine**: WebRTC (`RTCPeerConnection`, `RTCDataChannel`), Google STUN (primary), Metered TURN (fallback).
- **Native Emojis**: `emoji-picker-element` + quick reactions bar.

## 2. Engineering Guardrails (NON-NEGOTIABLE)

- **TDD Approach**: Write or update the failing regression test before changing implementation behavior. Keep Vitest unit/integration tests separate from Playwright browser end-to-end tests.
- **Strict Coverage**: Maintain >90% aggregate coverage for statements, branches, functions, and lines. The CI coverage command enforces each threshold.
- **End-to-End Reliability**: Run real multi-browser WebRTC tests through the local Cloudflare Worker and D1 emulator, including media and RTCDataChannel chat.
- **Code Quality**: Enforce Biome, Prettier, Commitlint, and Lefthook git hooks. Install hooks through the repository `prepare` script.
- **Versioning**: Changesets versioning (`.changeset`).
- **Privacy & Security**: Zero chat logging (RTCDataChannel only, never persist or log live messages), zero credential leaks (use Worker `c.env`).

## 3. Workflow & Key Commands

- Runtime / package manager: Bun 1.4.3; deployed Workers execute on Cloudflare's runtime.
- Install: `bun install`
- Dev (Worker): `bun run dev:worker`
- Dev (Web): `bun run dev:web`
- Typecheck: `bun run typecheck`
- Test & Coverage: `bun run test:coverage`
- Browser E2E: `bun run test:e2e` (apply `bun run db:migrate:local` first)
- Lint: `bun run lint`
- Format check: `bun run format:check`
- Format: `bun run format`
- Build: `bun run build`
