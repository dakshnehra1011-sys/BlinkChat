# Unresolved Questions & Design Decisions

## 1. WebCatalog Target Relevance

- **Question**: Why was `WebCatalog Setup 81.5.0.exe` supplied alongside the BlinkChat prompt?
- **Status**: Resolved. WebCatalog was supplied as a real-world Windows executable example to verify the REA reverse-engineering workflow (PE analysis, ASAR extraction, JavaScript AST reconstruction). WebCatalog's internal architecture has zero domain overlap with BlinkChat, so per Section 4.3 of the master prompt, BlinkChat's WebRTC & Cloudflare architecture is implemented independently.

## 2. Ephemeral vs Persistent Chat Logs

- **Question**: Should in-call text and emoji messages be stored in the database?
- **Status**: Resolved. In compliance with privacy standards and Section 12 of the prompt, chat messages are transmitted exclusively over `RTCDataChannel` directly between peers. They are NEVER logged or stored on any server.

## 3. TURN Relay Provisioning in Local Development

- **Question**: How should TURN relays be handled in local development?
- **Status**: Resolved. STUN is configured by default using Google public STUN servers for local development and direct P2P connections. For environments with symmetric NATs, a pluggable TURN configuration adapter is provided supporting short-lived HMAC credentials (RFC 5766).
