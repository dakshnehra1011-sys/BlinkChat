# Deployment & Operational Guide for BlinkChat

This guide covers production deployment on Cloudflare, database migrations, TURN relay provisioning, and the operational cost model.

---

## 1. Cloudflare Infrastructure Prerequisites

- Cloudflare Account with Workers Paid subscription (required for Durable Objects).
- Bun `1.4.3` (install with the official Bun installer).
- GitHub Actions secrets for Cloudflare API access and a provisioned Cloudflare D1 database.

For local browser tests, copy `apps/worker/.dev.vars.example` to
`apps/worker/.dev.vars`, replace the signing secret with a random value of at least 32
characters, then run `bun run db:migrate:local` and `bun run test:e2e`.

## 2. CI-Only Production Deployment

Production deployments and remote D1 migrations run through `.github/workflows/ci.yml`
after validation succeeds on a push to `main` or `master`. Pull requests validate but
never deploy. CI applies pending D1 migrations, deploys the Worker and Durable Objects,
then builds and deploys the React app to Cloudflare Pages.

Configure these GitHub Actions values:

- Actions secret `CLOUDFLARE_API_TOKEN`: permissions to deploy Workers, Pages, and apply D1 migrations.
- Actions variable `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns the Worker and Pages project.
- Actions secrets `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL`: Metered TURN relay configuration. The deploy workflow applies these to the Worker without putting credentials in source control. Use the exact server URLs shown in Metered's ICE server array if your credential is pinned to a region.

Before the first deployment, set `JWT_SIGNING_SECRET` as a Cloudflare Worker secret and
keep the same strong random value across releases so active sessions remain valid. Never
put Worker secrets in the browser bundle.

The Pages build uses `VITE_API_URL=https://blinkchat-worker.blinkchat.workers.dev`.
Configure the Pages project and Worker route to match these production domains.

Do not deploy from a workstation with Wrangler. Push a commit to the production branch
so the validated workflow applies migrations and publishes both services.

---

## 5. TURN Relay Provisioning & NAT Traversal

Public STUN servers can discover direct paths, but they do not relay traffic. A TURN
relay is required for many mobile, symmetric NAT, VPN, and corporate firewall networks.
When there is no configured TURN relay, audio, video, and the peer-to-peer chat channel
can all fail together because they use the same WebRTC connection.

However, when users sit behind symmetric NATs or restrictive enterprise firewalls, direct P2P connections cannot be established. For these cases:

1. Provision a TURN relay service (for example Metered, Twilio Network Traversal, or
   self-hosted Coturn). Cloudflare Workers and Pages do not provide a general purpose
   TURN relay; they only serve the app and signaling in this deployment.
2. Configure one of these options on the Worker. For static Metered TURN credentials, add `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` as GitHub Actions secrets; the `main` deployment workflow applies them to the Worker. For Metered's API integration, set `METERED_DOMAIN` and `METERED_API_KEY` as Worker bindings/secrets instead; the API key must never be placed in the frontend. Static TURN credentials should be short lived where the provider supports them. Verify `/api/config/ice` returns `turnAvailable: true` and at least one `turn:` or `turns:` URL after deploy.
3. `RTCPeerConnection.getStats()` reports whether the selected path is direct or relayed.

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
- [ ] User registers with email and password, then logs in.
- [ ] User enters Preview Stage; browser requests camera/microphone permissions.
- [ ] Live mirrored preview displays local video; audio meter registers activity.
- [ ] User enters Matchmaking Queue (WebSocket connected to `MatchmakerDO`).
- [ ] Second client enters queue; `match.found` fires on both clients within <50ms.
- [ ] SDP Offer/Answer and ICE candidates exchange cleanly via `SignalingDO`.
- [ ] Video tracks attach; peer video renders with low latency.
- [ ] Both peers exchange text and emojis over `RTCDataChannel`.
- [ ] User clicks "Next"; previous session terminates gracefully and user is re-queued.
- [ ] User clicks "Leave"; call interface closes and resources are disposed.
