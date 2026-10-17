# Behavioral Specification: BlinkChat Platform

## 1. User Journey & State Transitions

```
[Unauthenticated Landing]
      │
      ▼ Register / Login
[Email Verification Gate]
      │ Verified
      ▼
[Dashboard / Preview Stage]
  - Camera & Mic consent request
  - Device selection & live local stream preview
  - Connection quality pre-check
      │
      ▼ Click "Find Stranger"
[Matchmaking Queue (Durable Object)]
  - WebSocket connected with Auth Bearer token
  - State: `queued`
  - Timeout / Cancel handling
      │ Stranger matched
      ▼
[P2P Signaling Phase (SignalingDO)]
  - Session ID generated
  - Deterministic Offer/Answer exchange via WebSockets
  - Trickle ICE candidate transmission
  - State: `connecting`
      │ RTCPeerConnection connected
      ▼
[Active Video & Chat Call]
  - Remote media track stream rendered
  - Local video preview docked non-intrusively
  - RTCDataChannel opened (`blinkchat-chat`) for text & emoji
  - In-call controls: Mute Audio, Stop Video, Flip Camera, Report, Leave, Next
      │
      ├─── Click "Next" ───► Idempotently close RTCPeerConnection -> Inform remote peer -> Re-enter Queue
      ├─── Remote Disconnect ───► Inform user -> Offer "Find Next"
      └─── Click "Leave" ───► Full deterministic cleanup -> Return to Preview Stage
```

## 2. Invariants & Guardrails

- **Self-Match Prevention**: A user's account ID is strictly forbidden from matching against itself.
- **Single Active Session**: MatchmakerDO evicts prior stale sessions when a client requests a new match.
- **Signaling Boundary Isolation**: Signaling messages for session `S` are dropped if sent by a user not enrolled in session `S`.
- **Bandwidth Fallback**: When direct host-to-host or reflexive ICE candidates fail due to symmetric NATs, ephemeral TURN credentials relay media without server-side media recording or unconsented persistence.
