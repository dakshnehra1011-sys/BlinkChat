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

- **TDD Approach**: Unit/integration tests with Vitest before or accompanying implementation.
- **Strict Coverage**: Maintain >90% code coverage across statements and lines.
- **Code Quality**: Enforce Biome, Prettier, Commitlint, and Lefthook git hooks.
- **Versioning**: Changesets versioning (`.changeset`).
- **Privacy & Security**: Zero chat logging (RTCDataChannel only, never persist or log live messages), zero credential leaks (use Worker `c.env`).

## 3. Workflow & Key Commands

- Install: `pnpm install`
- Dev (Worker): `pnpm dev:worker`
- Dev (Web): `pnpm dev:web`
- Typecheck: `pnpm typecheck`
- Test & Coverage: `pnpm test:coverage`
- Lint: `pnpm lint`
- Format: `pnpm format`
- Build: `pnpm build`
