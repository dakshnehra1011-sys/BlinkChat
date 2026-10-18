# Real-time media decision

## Current choice

BlinkChat is designed for one-to-one WebRTC calls. Cloudflare Workers and Durable Objects handle account/API requests, matchmaking, and the WebRTC signaling handshake. After signaling, audio/video use the browser's WebRTC connection; chat and emoji messages use the WebRTC data channel. The Worker is not intended to receive or forward call media.

This matches the small-scale requirement for low operating cost and direct peer connections. It does not guarantee a direct path on every network: NAT and firewall behavior can prevent browsers from establishing a direct ICE connection.

## Cloudflare Realtime products considered

- [Cloudflare Realtime overview](https://developers.cloudflare.com/realtime/) describes Cloudflare's managed real-time building blocks.
- [RealtimeKit](https://developers.cloudflare.com/realtime/realtimekit/) is a managed meeting product with SDKs and media infrastructure. It would add a media service to the call path, so it is not the current fit for the strict direct-peer requirement.
- [Realtime SFU](https://developers.cloudflare.com/realtime/sfu/get-started/) forwards media through a Selective Forwarding Unit. This can support managed multi-party media delivery, but it is not a no-media-server P2P topology.

These are alternatives to reconsider if product needs change to group calls, managed media delivery, or network reachability guarantees. No RealtimeKit or SFU integration is present in this repository.

## TURN status and connectivity caveat

The application exposes authenticated `/api/config/ice` and supports optional Cloudflare Realtime TURN, Metered, or statically configured TURN servers. Cloudflare TURN credentials are generated server-side with a short expiry; its long-lived API token must remain in Worker secrets. The current production configuration has no TURN credentials (`turnAvailable: false`). Google STUN is configured, but STUN alone cannot guarantee connectivity through restrictive NATs or firewalls. In those cases a call can fail to connect or media can fail to flow.

TURN improves reachability by relaying media through a TURN server. When a TURN candidate is selected, that session is no longer a literal browser-to-browser media path. Enabling TURN therefore trades the strict no-intermediary property for better connectivity and incurs relay bandwidth cost. The product owner should make that trade-off explicitly before configuring production TURN.

## Scope and validation gates

Keep the initial product one-to-one. Before claiming production readiness for distant or restrictive networks, run two real browsers on separate networks, verify selected ICE candidate types and bidirectional audio/video/data channel, and repeat with TURN enabled if it is part of the production plan. Existing Playwright tests validate UI flows with mocked media; they are not real peer-call tests.

Track call setup success, setup time percentiles, connection failures by network class, direct-versus-relayed candidate counts (without collecting candidate IP addresses), and Worker/Durable Object/TURN costs. Set scale and latency targets from measured traffic rather than an unverified “sub-100ms” claim. Cloudflare TURN must be provisioned with an account TURN key and a Calls: Write API token before this fallback becomes active.
