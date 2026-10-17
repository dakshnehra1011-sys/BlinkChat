# Deployment & Operational Guide for BlinkChat

This guide covers production deployment on Cloudflare, database migrations, TURN relay provisioning, and the operational cost model.

---

## 1. Cloudflare Infrastructure Prerequisites

- Cloudflare Account with Workers Paid subscription (required for Durable Objects).
- Node.js `>= 20.0.0` and `pnpm`.
- Wrangler CLI authenticated (`npx wrangler login`).

---

## 2. D1 Database Setup & Migrations

1. Create the production D1 database:
   ```bash
   npx wrangler d1 create blinkchat_production_d1
   ```
2. Copy the resulting `database_id` into `apps/worker/wrangler.jsonc` under `d1_databases`.
3. Apply migrations to the remote D1 instance:
   ```bash
   npx wrangler d1 migrations apply blinkchat_production_d1 --remote
   ```

---

## 3. Cloudflare Worker Deployment

1. Set secret environment variables in Cloudflare:
   ```bash
   cd apps/worker
   npx wrangler secret put JWT_SECRET
   # Enter a strong 64-character random string
   ```
2. Deploy the Worker and Durable Objects:
   ```bash
   npx wrangler deploy
   ```
   This deploys:
   - Hono HTTP API routes (`/api/auth/*`, `/api/reports`, `/api/config/ice`)
   - WebSocket entry points (`/api/ws/match`, `/api/ws/session`)
   - `MatchmakerDO` and `SignalingDO` Durable Object instances

---

## 4. Frontend Deployment (Cloudflare Pages)

1. Build the production web bundle:
   ```bash
   pnpm --filter @blinkchat/web build
   ```
   Output directory: `apps/web/dist`
2. Deploy via Wrangler Pages:
   ```bash
   npx wrangler pages deploy apps/web/dist --project-name blinkchat-web
   ```
3. In the Cloudflare Pages dashboard:
   - Configure proxy routes or custom domains so that `/api/*` proxies to the Worker domain.

---

## 5. TURN Relay Provisioning & NAT Traversal

By default, BlinkChat uses public Google STUN servers for direct host-to-host and reflexive peer connections (ICE UDP hole punching). Direct connections incur **zero server bandwidth cost**.

However, when users sit behind symmetric NATs or restrictive enterprise firewalls, direct P2P connections cannot be established. For these cases:

1. Provision a TURN relay service (e.g. Twilio Network Traversal, Cloudflare Calls, or self-hosted Coturn).
2. Set environment variables on the Worker:
   ```bash
   npx wrangler secret put TURN_URLS
   npx wrangler secret put TURN_USERNAME
   npx wrangler secret put TURN_CREDENTIAL
   ```
3. The Worker automatically dispenses these credentials through `/api/config/ice`.
4. In frontend client code, `RTCPeerConnection.getStats()` monitors whether the selected candidate is `direct` (host/srflx) or `relayed`.

---

## 6. Operational Cost Model

| Component             | Architecture Role              | Cost Mechanism                              | Cost Optimization                                          |
| --------------------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| **Cloudflare Pages**  | Static React SPA hosting       | Free on Cloudflare Pages                    | Assets pre-gzipped, CDN cached                             |
| **Cloudflare Worker** | Auth API & WebSocket gateway   | $5/mo base + $0.30 / 1M requests            | Edge routing, minimal compute                              |
| **Durable Objects**   | Queue & Session coordination   | $0.15 / 1M requests + $12.50 / GB-mo memory | In-memory queues; sessions evicted immediately on call end |
| **Cloudflare D1**     | Users, sessions, reports       | $0.75 / 1M writes, $0.001 / 1M reads        | Read-heavy queries, indexed lookups                        |
| **P2P Video/Audio**   | Live media streams             | **$0.00** (Direct peer connection)          | 85-90% of traffic travels peer-to-peer                     |
| **TURN Relay**        | Restrictive NAT fallback media | ~$0.05 - $0.15 per GB relayed               | Only used when direct P2P fails                            |

---

## 7. Staging Smoke-Test Checklist

- [ ] Fresh visitor lands on Landing page, sees value prop and privacy policy.
- [ ] User registers with new email, receives verification token, verifies account.
- [ ] User enters Preview Stage; browser requests camera/microphone permissions.
- [ ] Live mirrored preview displays local video; audio meter registers activity.
- [ ] User enters Matchmaking Queue (WebSocket connected to `MatchmakerDO`).
- [ ] Second client enters queue; `match.found` fires on both clients within <50ms.
- [ ] SDP Offer/Answer and ICE candidates exchange cleanly via `SignalingDO`.
- [ ] Video tracks attach; peer video renders with low latency.
- [ ] Both peers exchange text and emojis over `RTCDataChannel`.
- [ ] User clicks "Next"; previous session terminates gracefully and user is re-queued.
- [ ] User clicks "Leave"; call interface closes and resources are disposed.
