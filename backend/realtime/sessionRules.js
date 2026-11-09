const { nowMs } = require('./sessionsStore');

// Rule thresholds
const INACTIVE_MS = 120 * 1000;
const STRUGGLING_WRONG_ATTEMPTS_ON_QUESTION = 2;
const STRUGGLING_ALERT_COUNT = 3;
const LOW_ACCURACY_MIN_ATTEMPTS = 5;
const LOW_ACCURACY_THRESHOLD = 0.5;

function ensureStudent(session, studentId) {
  const id = String(studentId);
  if (!session.students[id]) {
    session.students[id] = {
      studentId: id,
      name: null,
      joinedAt: new Date().toISOString(),
      lastActivityAtMs: nowMs(),

      // For time-spent heuristics
      currentQuestionId: null,
      currentQuestionStartedAtMs: null,

      // questionId -> { attempts, correct, wrong }
      perQuestion: Object.create(null),

      // derived flags (updated by rules)
      strugglingQuestions: new Set(),
      isInactive: false,
    };
  }
  return session.students[id];
}

function recordActivity(student) {
  student.lastActivityAtMs = nowMs();
  student.isInactive = false;
}

function addRaisedHand(session, studentId, questionId, timestamp) {
  const id = String(studentId);
  const qid = String(questionId);
  // de-dupe per student+question
  const already = session.raisedHands.some((h) => h.studentId === id && String(h.questionId) === qid);
  if (!already) session.raisedHands.push({ studentId: id, questionId: qid, timestamp });

  // Persist to history so end-of-session reports can show who raised hands
  // even if it was later resolved.
  if (!session.raisedHandHistory) session.raisedHandHistory = Object.create(null);
  if (!session.raisedHandHistory[qid]) session.raisedHandHistory[qid] = Object.create(null);
  if (!session.raisedHandHistory[qid][id]) {
    session.raisedHandHistory[qid][id] = { timestamp };
  }
}

function clearRaisedHand(session, studentId, questionId) {
  const id = String(studentId);
  if (questionId === undefined || questionId === null) {
    session.raisedHands = session.raisedHands.filter((h) => h.studentId !== id);
    return;
  }
  const qid = String(questionId);
  session.raisedHands = session.raisedHands.filter((h) => !(h.studentId === id && String(h.questionId) === qid));
}

function ensureQuestionStats(map, questionId) {
  const qid = String(questionId);
  if (!map[qid]) map[qid] = { questionId: qid, attempts: 0, correct: 0, wrong: 0 };
  return map[qid];
}

function applyInactivityRule(session, currentTimeMs) {
  const now = Number.isFinite(currentTimeMs) ? currentTimeMs : nowMs();
  let inactiveCount = 0;
  for (const student of Object.values(session.students)) {
    const inactive = now - (student.lastActivityAtMs || 0) > INACTIVE_MS;
    student.isInactive = inactive;
    if (inactive) inactiveCount += 1;
  }
  return inactiveCount;
}

function recomputeStrugglingForStudent(student) {
  // struggling if >= 2 wrong attempts on the same question
  student.strugglingQuestions = new Set(
    Object.values(student.perQuestion)
      .filter((pq) => (pq.wrong || 0) >= STRUGGLING_WRONG_ATTEMPTS_ON_QUESTION)
      .map((pq) => String(pq.questionId))
  );
}

function computeStrugglingCount(session) {
  let strugglingStudents = 0;
  for (const student of Object.values(session.students)) {
    recomputeStrugglingForStudent(student);
    if (student.strugglingQuestions.size > 0) strugglingStudents += 1;
  }
  return strugglingStudents;
}

function computeLowAccuracyQuestions(session) {
  const difficult = [];
  for (const qs of Object.values(session.questionStats)) {
    const attempts = qs.attempts || 0;
    const correct = qs.correct || 0;
    if (attempts < LOW_ACCURACY_MIN_ATTEMPTS) continue;
    const accuracy = attempts ? (correct / attempts) : 0;
    if (accuracy < LOW_ACCURACY_THRESHOLD) {
      difficult.push({ questionId: String(qs.questionId), accuracy: Math.round(accuracy * 100) });
    }
  }
  return difficult;
}

function computeQuestionStatsArray(session) {
  return Object.values(session.questionStats)
    .map((qs) => {
      const attempts = qs.attempts || 0;
      const correct = qs.correct || 0;
      const wrong = qs.wrong || 0;
      const accuracy = attempts ? (correct / attempts) : 0;
      return {
        questionId: String(qs.questionId),
        accuracy: Math.round(accuracy * 100),
        attempts,
        correct,
        wrong,
      };
    })
    .sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

module.exports = {
  // thresholds
  INACTIVE_MS,
  STRUGGLING_WRONG_ATTEMPTS_ON_QUESTION,
  STRUGGLING_ALERT_COUNT,
  LOW_ACCURACY_MIN_ATTEMPTS,
  LOW_ACCURACY_THRESHOLD,

  // helpers
  ensureStudent,
  recordActivity,
  addRaisedHand,
  clearRaisedHand,
  ensureQuestionStats,

  // rule computations
  applyInactivityRule,
  computeStrugglingCount,
  computeLowAccuracyQuestions,
  computeQuestionStatsArray,
};
