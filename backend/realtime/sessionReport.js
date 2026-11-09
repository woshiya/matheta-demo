const { computeAggregation } = require('./sessionAggregate');
const { nowMs } = require('./sessionsStore');

function toPlainStudent(s) {
  return {
    studentId: String(s.studentId),
    name: s.name || null,
    joinedAt: s.joinedAt || null,
    lastActivityAtMs: s.lastActivityAtMs || null,
    isInactive: Boolean(s.isInactive),
    currentQuestionId: s.currentQuestionId ? String(s.currentQuestionId) : null,
    currentQuestionStartedAtMs: s.currentQuestionStartedAtMs || null,
    strugglingQuestions: Array.from(s.strugglingQuestions || []),
    perQuestion: s.perQuestion || {},
  };
}

function buildSessionReport(session) {
  const endedAtMs = nowMs();
  const agg = computeAggregation(session, endedAtMs);

  const questions = Array.isArray(session.questions) ? session.questions : [];
  const questionIndex = Object.create(null);
  for (const q of questions) {
    questionIndex[String(q.id)] = q;
  }

  // Per-question consolidated view
  const perQuestion = Object.create(null);
  for (const qs of agg.questionStats || []) {
    perQuestion[String(qs.questionId)] = {
      questionId: String(qs.questionId),
      text: questionIndex[String(qs.questionId)]?.text || null,
      attempts: qs.attempts,
      correct: qs.correct,
      wrong: qs.wrong ?? Math.max(0, (qs.attempts || 0) - (qs.correct || 0)),
      accuracy: qs.accuracy,
      raisedHands: 0,
      raisedHandStudentIds: [],
      raisedHandHistoryStudentIds: [],
      difficultMarks: 0,
      difficultMarkStudentIds: [],
      slowCount: 0,
      slowStudentIds: [],
      solveTime: {
        count: 0,
        minSeconds: null,
        maxSeconds: null,
        meanSeconds: null,
      },
    };
  }
  for (const rh of agg.questionRaisedHands || []) {
    const qid = String(rh.questionId);
    if (!perQuestion[qid]) {
      perQuestion[qid] = {
        questionId: qid,
        text: questionIndex[qid]?.text || null,
        attempts: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: {
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          meanSeconds: null,
        },
      };
    }
    perQuestion[qid].raisedHands = rh.count;
    perQuestion[qid].raisedHandStudentIds = Array.isArray(rh.studentIds) ? rh.studentIds.slice() : [];

    // Back-compat: if we don't have hand history (older sessions), at least treat
    // the open hands as "any" so the report UI isn't contradictory.
    if ((perQuestion[qid].raisedHandHistoryStudentIds || []).length === 0) {
      perQuestion[qid].raisedHandHistoryStudentIds = perQuestion[qid].raisedHandStudentIds.slice();
    }
  }

  // Raised hand history (includes resolved hands)
  for (const rh of agg.questionRaisedHandHistory || []) {
    const qid = String(rh.questionId);
    if (!perQuestion[qid]) {
      perQuestion[qid] = {
        questionId: qid,
        text: questionIndex[qid]?.text || null,
        attempts: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: {
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          meanSeconds: null,
        },
      };
    }
    perQuestion[qid].raisedHandHistoryStudentIds = Array.isArray(rh.studentIds) ? rh.studentIds.slice() : [];
  }

  for (const d of agg.questionDifficult || []) {
    const qid = String(d.questionId);
    if (!perQuestion[qid]) {
      perQuestion[qid] = {
        questionId: qid,
        text: questionIndex[qid]?.text || null,
        attempts: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: {
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          meanSeconds: null,
        },
      };
    }
    perQuestion[qid].difficultMarks = d.count;
    perQuestion[qid].difficultMarkStudentIds = Array.isArray(d.studentIds) ? d.studentIds.slice() : [];
  }
  for (const sl of agg.slowByQuestion || []) {
    const qid = String(sl.questionId);
    if (!perQuestion[qid]) {
      perQuestion[qid] = {
        questionId: qid,
        text: questionIndex[qid]?.text || null,
        attempts: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        raisedHands: 0,
        raisedHandStudentIds: [],
        raisedHandHistoryStudentIds: [],
        difficultMarks: 0,
        difficultMarkStudentIds: [],
        slowCount: 0,
        slowStudentIds: [],
        solveTime: {
          count: 0,
          minSeconds: null,
          maxSeconds: null,
          meanSeconds: null,
        },
      };
    }
    perQuestion[qid].slowCount = sl.count;
    perQuestion[qid].slowStudentIds = Array.isArray(sl.studentIds) ? sl.studentIds.slice() : [];
  }

  // Solve-time stats (min/max/mean per question)
  const solveMsByQuestion = Object.create(null); // qid -> number[]
  for (const s of Object.values(session.students || {})) {
    const per = s?.perQuestion || {};
    for (const pq of Object.values(per)) {
      const qid = String(pq?.questionId ?? '');
      if (!qid) continue;
      const ms = pq?.solveMs;
      if (!Number.isFinite(ms) || ms < 0) continue;
      if (!solveMsByQuestion[qid]) solveMsByQuestion[qid] = [];
      solveMsByQuestion[qid].push(ms);
    }
  }
  for (const [qid, list] of Object.entries(solveMsByQuestion)) {
    if (!perQuestion[qid]) continue;
    if (!Array.isArray(list) || list.length === 0) continue;
    const sorted = list.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((acc, n) => acc + n, 0);
    const minSeconds = Math.round(sorted[0] / 1000);
    const maxSeconds = Math.round(sorted[sorted.length - 1] / 1000);
    const meanSeconds = Math.round((sum / sorted.length) / 1000);
    perQuestion[qid].solveTime = {
      count: sorted.length,
      minSeconds,
      maxSeconds,
      meanSeconds,
    };
  }

  const perQuestionArray = Object.values(perQuestion).sort(
    (a, b) => Number(a.questionId) - Number(b.questionId)
  );

  return {
    kind: 'session_report',
    sessionId: session.sessionId,
    teacherId: session.teacherId || null,
    classId: session.classId,
    assignmentId: session.assignmentId,
    assignmentTitle: session.assignmentTitle || null,
    startedAt: session.startTime,
    endedAt: session.endTime || new Date(endedAtMs).toISOString(),
    endedAtMs,

    summary: {
      activeStudents: agg.activeStudents,
      raisedHandCount: agg.raisedHandCount,
      strugglingCount: agg.strugglingCount,
      inactiveCount: agg.inactiveCount,
      lowAccuracyQuestions: agg.lowAccuracyQuestions,
      alerts: agg.alerts,
    },

    perQuestion: perQuestionArray,
    slowStudents: agg.slowStudents || [],

    // Keep minimal student snapshot for report.
    students: Object.values(session.students || {}).map(toPlainStudent),
  };
}

module.exports = {
  buildSessionReport,
};
