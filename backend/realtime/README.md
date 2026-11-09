## Real-time (Socket.io) MVP

This folder contains the in-memory live session runtime for the Matheta MVP.

Design goals:

- In-memory session state (no Redis)
- Deterministic rule-based alerts (no AI)
- Teacher receives aggregated `session_update` only (no raw student events)
- One or a few concurrent sessions

Key modules:

- `sessionsStore.js`: in-memory store for all live sessions
- `sessionAggregate.js`: computes aggregated update payload + alerts
- `sessionRules.js`: deterministic rules (struggling, raised hands, low accuracy, inactivity)
- `socket.js`: socket.io wiring + event handlers
