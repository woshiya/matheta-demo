const {
  applyInactivityRule,
  computeStrugglingCount,
  computeLowAccuracyQuestions,
  computeQuestionStatsArray,
  STRUGGLING_ALERT_COUNT,
} = require('./sessionRules');
const { nowMs } = require('./sessionsStore');

function computeQuestionRaisedHands(session) {
  const byQuestion = Object.create(null);
  for (const h of session.raisedHands || []) {
    const qid = String(h.questionId ?? '');
    if (!qid) continue;
    if (!byQuestion[qid]) byQuestion[qid] = { questionId: qid, count: 0, studentIds: [] };
    byQuestion[qid].count += 1;
    byQuestion[qid].studentIds.push(String(h.studentId));
  }

  // Attach names for teacher UI convenience.
  for (const x of Object.values(byQuestion)) {
    x.students = (x.studentIds || []).map((id) => ({
      studentId: String(id),
      name: session.students?.[String(id)]?.name || null,
    }));
  }

  return Object.values(byQuestion).sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

function computeQuestionRaisedHandHistory(session) {
  const byQuestion = Object.create(null);
  const hist = session.raisedHandHistory || {};
  for (const [qid, students] of Object.entries(hist)) {
    const ids = Object.keys(students || {});
    if (ids.length === 0) continue;
    byQuestion[String(qid)] = {
      questionId: String(qid),
      count: ids.length,
      studentIds: ids,
    };
  }
  return Object.values(byQuestion).sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

function computeQuestionDifficultMarks(session) {
  const out = [];
  const dm = session.difficultMarks || {};
  for (const [qid, students] of Object.entries(dm)) {
    const ids = Object.keys(students || {});
    if (ids.length === 0) continue;
    out.push({
      questionId: String(qid),
      count: ids.length,
      studentIds: ids,
      students: ids.map((id) => ({
        studentId: String(id),
        name: session.students?.[String(id)]?.name || null,
      })),
    });
  }
  return out.sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

function computeQuestionAnswered(session) {
  const out = [];
  const m = session.answeredByQuestion || {};
  for (const [qid, students] of Object.entries(m)) {
    const ids = Object.keys(students || {});
    if (ids.length === 0) continue;
    out.push({
      questionId: String(qid),
      count: ids.length,
      studentIds: ids,
      students: ids.map((id) => ({
        studentId: String(id),
        name: session.students?.[String(id)]?.name || null,
      })),
    });
  }
  return out.sort((a, b) => Number(a.questionId) - Number(b.questionId));
}

function computeSlowStudents(session, currentTimeMs) {
  const now = Number.isFinite(currentTimeMs) ? currentTimeMs : nowMs();
  const slow = [];
  for (const s of Object.values(session.students || {})) {
    const qid = s.currentQuestionId ? String(s.currentQuestionId) : null;
    const started = s.currentQuestionStartedAtMs;
    if (!qid || !started) continue;
    if (now - started < 60_000) continue;
    slow.push({
      studentId: String(s.studentId),
      name: s.name || null,
      questionId: qid,
      seconds: Math.floor((now - started) / 1000),
    });
  }

  // Also provide per-question counts
  const byQuestion = Object.create(null);
  for (const x of slow) {
    const qid = String(x.questionId);
    if (!byQuestion[qid]) byQuestion[qid] = { questionId: qid, count: 0, studentIds: [] };
    byQuestion[qid].count += 1;
    byQuestion[qid].studentIds.push(String(x.studentId));
  }

  for (const x of Object.values(byQuestion)) {
    x.students = (x.studentIds || []).map((id) => ({
      studentId: String(id),
      name: session.students?.[String(id)]?.name || null,
    }));
  }

  return {
    slowStudents: slow,
    slowByQuestion: Object.values(byQuestion).sort((a, b) => Number(a.questionId) - Number(b.questionId)),
  };
}

function computeAggregation(session, currentTimeMs) {
  const now = Number.isFinite(currentTimeMs) ? currentTimeMs : nowMs();

  const activeStudents = Object.keys(session.students).length;
  // teacher sees count; server keeps question-specific records.
  const raisedHandCount = session.raisedHands.length;
  const inactiveCount = applyInactivityRule(session, now);
  const strugglingCount = computeStrugglingCount(session);
  const lowAccuracyQuestions = computeLowAccuracyQuestions(session);
  const questionStats = computeQuestionStatsArray(session);

  const questionRaisedHands = computeQuestionRaisedHands(session);
  const questionRaisedHandHistory = computeQuestionRaisedHandHistory(session);
  const questionDifficult = computeQuestionDifficultMarks(session);
  const questionAnswered = computeQuestionAnswered(session);
  const { slowStudents, slowByQuestion } = computeSlowStudents(session, now);

  // Minimal roster so teacher UI can render names.
  const students = Object.values(session.students || {}).map((s) => ({
    studentId: String(s.studentId),
    name: s.name || null,
    isInactive: Boolean(s.isInactive),
  }));

  // Deterministic alerts for teacher UI
  const alerts = {
    raisedHands: raisedHandCount > 0,
    struggling: strugglingCount >= STRUGGLING_ALERT_COUNT,
    // You can surface difficult questions as a yellow warning
    lowAccuracy: lowAccuracyQuestions.length > 0,
    inactivity: inactiveCount > 0,
  };

  return {
    activeStudents,
    raisedHandCount,
    strugglingCount,
    // useful for debugging
    strugglingAlertThreshold: STRUGGLING_ALERT_COUNT,
    lowAccuracyQuestions,
    inactiveCount,
    questionStats,
    questionRaisedHands,
    questionRaisedHandHistory,
    questionDifficult,
    questionAnswered,
    slowByQuestion,
    slowStudents,
    students,
    alerts,
    serverTime: new Date(now).toISOString(),
  };
}

function shouldEmitUpdate(session, minIntervalMs) {
  const minMs = Number.isFinite(minIntervalMs) ? minIntervalMs : 2500;
  const now = nowMs();
  if (!session.lastUpdateEmittedAtMs) return true;
  return (now - session.lastUpdateEmittedAtMs) >= minMs;
}

module.exports = {
  computeAggregation,
  shouldEmitUpdate,
};
