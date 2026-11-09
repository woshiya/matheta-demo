# Matheta Live Session MVP (Socket.io)

This repo now includes a clean Socket.io + Express real-time architecture for a live classroom session.

## Backend

Location: `backend/realtime/*`

Install + run:

1. `cd backend`
1. `npm install`
1. `PORT=5001 node server.js`

Notes:

- Session storage is in-memory.
- Teacher receives aggregated `session_update` only.

## Frontend

Install + run:

1. `npm install`
1. `npm run dev`

Vite env vars (optional):

- `VITE_API_BASE_URL` (REST)
- `VITE_SOCKET_BASE_URL` (Socket.io)

## Teacher flow

1. Go to `Teacher Panel -> Live Session`
1. Enter `classId` and `assignmentId`
1. Click `Start Session`
1. Share the `sessionId` shown in the Live Session page

## Student flow

1. Go to `Student -> Live Session`
1. Paste the `sessionId`
1. Use the demo buttons to emit events:

- Wrong Attempt
- Correct Answer
- Raise Hand

Teacher UI will update via aggregated `session_update`.
