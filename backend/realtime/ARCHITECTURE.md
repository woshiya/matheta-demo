# Matheta Real-time Architecture (MVP)

This is a clean, rule-based Socket.io + Express architecture for a live classroom session.

Constraints:

- In-memory session storage (no Redis)
- Rule-based alerts only (no AI/ML)
- Teacher receives aggregated updates only
- Designed for 1 to a few concurrent sessions

## Folder structure

```
backend/
  server.js
  realtime/
    socket.js
    sessionsStore.js
    sessionRules.js
    sessionAggregate.js
    README.md
    ARCHITECTURE.md
```

## Session state shape

`sessionsStore.js` keeps:

- `sessions[sessionId] -> sessionState`

Session state:

```js
{
  sessionId,
  classId,
  assignmentId,
  teacherId,
  startTime,
  endTime,
  status: 'running' | 'ended',

  students: {
    [studentId]: {
      studentId,
      joinedAt,
      lastActivityAtMs,
      perQuestion: {
        [questionId]: { questionId, attempts, correct, wrong }
      },
      strugglingQuestions: Set<string>,
      isInactive: boolean
    }
  },

  raisedHands: [{ studentId, timestamp }],

  questionStats: {
    [questionId]: { questionId, attempts, correct, wrong }
  },

  lastUpdateEmittedAtMs,
  lastAggregation,
  createdAtMs,
  updatedAtMs
}
```

## Data flow (what happens in a live session)

1. Teacher creates session:
`teacher_start_session` -> server creates a new in-memory `sessionState` and joins the teacher socket to room `session_${sessionId}`.

2. Students join:
`student_join` -> server creates/ensures `students[studentId]`, records activity, and joins the socket to the same room.

3. Students send events:

- `student_answered`
- `student_wrong_attempt`
- `student_raised_hand`
- `student_activity` (heartbeat)

Server updates the session state, but does **not** broadcast those events.

4. Aggregation tick:
Every ~2.5 seconds the server computes `session_update` and emits it to the room.

5. Teacher ends session:
`teacher_end_session` -> stop ticker + mark session ended + emit a final `session_update`.

## Rules implemented (deterministic)

- Raised hand alert:
`raisedHands.length > 0`

- Struggling student:
If a student has `wrong >= 2` on the same question.
Aggregated struggling alert if `strugglingCount >= 3`.

- Low accuracy question:
For each question, `accuracy = correct / attempts`.
If `attempts >= 5` and `accuracy < 50%`, mark it difficult.

- Inactivity:
If `now - lastActivityAtMs > 120s`, mark student inactive.

## Aggregated payload

The room receives only:

```json
{
  "sessionId": "...",
  "classId": "...",
  "assignmentId": "...",
  "startTime": "...",
  "status": "running",
  "activeStudents": 26,
  "raisedHandCount": 3,
  "strugglingCount": 4,
  "lowAccuracyQuestions": [
    { "questionId": "3", "accuracy": 42 }
  ],
  "inactiveCount": 2,
  "questionStats": [
    { "questionId": "1", "accuracy": 92, "attempts": 12, "correct": 11 },
    { "questionId": "2", "accuracy": 81, "attempts": 16, "correct": 13 }
  ],
  "alerts": {
    "raisedHands": true,
    "struggling": true,
    "lowAccuracy": true,
    "inactivity": true
  },
  "serverTime": "2026-05-28T...Z"
}
```

This keeps the system stable and reduces UI load: teacher sees summarized state, not raw event spam.
