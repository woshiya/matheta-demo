const crypto = require('crypto');

// In-memory store: sessionId -> sessionState
//
// MVP notes:
// - This will reset on server restart.
// - Designed for a few concurrent sessions.
const sessions = Object.create(null);

function createSessionId() {
  // Short, URL-safe-ish id.
  // crypto.randomUUID exists in modern Node; fallback is safe.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function isValidSessionId(sessionId) {
  const s = String(sessionId || '').trim();
  if (!s) return false;
  // Keep it simple for join codes and URLs.
  if (s.length < 4 || s.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

function nowMs() {
  return Date.now();
}

function createInitialSessionState({ classId, assignmentId, teacherId, sessionId }) {
  const id = sessionId ? String(sessionId) : createSessionId();
  return {
    sessionId: id,
    classId: String(classId),
    assignmentId: String(assignmentId),
    teacherId: teacherId ? String(teacherId) : null,
    startTime: new Date().toISOString(),
    endTime: null,
    status: 'running', // running | ended

    // pacingMode:
    // - student_paced: students see whole worksheet (current behaviour)
    // - teacher_led: teacher advances one question at a time
    pacingMode: 'student_paced',

    // For teacher-led sessions
    currentQuestionIndex: 0,

    // students: studentId -> per-student state
    students: Object.create(null),

    // raisedHands: array of { studentId, timestamp }
    // raisedHands: array of { studentId, questionId, timestamp }
    raisedHands: [],

    // Historical record of raised hands (for reports). This does NOT get cleared
    // when a hand is resolved, so reports can answer "who raised their hand".
    // questionId -> { [studentId]: { timestamp } }
    raisedHandHistory: Object.create(null),

    // questionStats: questionId -> { attempts, correct, wrong }
    questionStats: Object.create(null),

    // answeredByQuestion: questionId -> { [studentId]: true }
    answeredByQuestion: Object.create(null),

    // blackboard: questionId -> { workingText, showAnswer }
    blackboard: Object.create(null),

    // difficultMarks: questionId -> { [studentId]: true }
    difficultMarks: Object.create(null),

    // Student-facing worksheet data (loaded from DB on demand)
    assignmentTitle: null,
    questions: null, // [{ id, text }]
    correctAnswers: null, // { [questionId]: string }

    // Used to avoid spamming aggregated updates more often than desired.
    lastUpdateEmittedAtMs: 0,

    // Cache: last computed aggregation (handy for teacher join / debug)
    lastAggregation: null,

    // For cleanup / diagnostics
    createdAtMs: nowMs(),
    updatedAtMs: nowMs(),
  };
}

function getSession(sessionId) {
  if (!sessionId) return null;
  return sessions[String(sessionId)] || null;
}

function listSessions() {
  return Object.values(sessions);
}

function createSession({ classId, assignmentId, teacherId, sessionId }) {
  if (!classId || !assignmentId) {
    throw new Error('classId and assignmentId are required');
  }
  if (sessionId !== undefined && sessionId !== null) {
    if (!isValidSessionId(sessionId)) {
      throw new Error('Invalid sessionId');
    }
    if (sessions[String(sessionId)]) {
      throw new Error('SessionId already in use');
    }
  }

  const session = createInitialSessionState({ classId, assignmentId, teacherId, sessionId });
  sessions[session.sessionId] = session;
  return session;
}

function endSession(sessionId) {
  const s = getSession(sessionId);
  if (!s) return null;
  s.status = 'ended';
  s.endTime = new Date().toISOString();
  s.updatedAtMs = nowMs();
  return s;
}

function deleteSession(sessionId) {
  const id = String(sessionId);
  const existed = Boolean(sessions[id]);
  delete sessions[id];
  return existed;
}

module.exports = {
  sessions,
  createSession,
  getSession,
  listSessions,
  endSession,
  deleteSession,
  nowMs,
  isValidSessionId,
};
