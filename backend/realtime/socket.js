const { Server } = require('socket.io');
const {
  createSession,
  getSession,
  endSession,
  nowMs,
} = require('./sessionsStore');

const { answersEquivalent } = require('../marking');
const {
  ensureStudent,
  recordActivity,
  addRaisedHand,
  clearRaisedHand,
  ensureQuestionStats,
} = require('./sessionRules');
const { computeAggregation, shouldEmitUpdate } = require('./sessionAggregate');
const { saveReport } = require('./reportsStore');
const { buildSessionReport } = require('./sessionReport');

// Lazy DB loader for student worksheet data.
// We keep it here (not in server.js) to keep the realtime feature self-contained.
let _pool = null;
async function getPool() {
  if (_pool) return _pool;
  // eslint-disable-next-line global-require
  const { Pool } = require('pg');

  // Mirror server.js env parsing logic (minimal).
  const cfg = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      }
      : {
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'matheta_system',
        password: String(process.env.PGPASSWORD ?? ''),
        port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      };

  _pool = new Pool(cfg);
  return _pool;
}

async function getOrLoadSessionWorksheetData(session) {
  if (session.assignmentTitle && Array.isArray(session.questions)) {
    const totalQuestions = Array.isArray(session.questions) ? session.questions.length : 0;
    const idx = Math.max(0, Math.min(totalQuestions - 1, Number(session.currentQuestionIndex ?? 0)));
    const currentQuestionId = totalQuestions ? String(session.questions[idx]?.id ?? '') : '';
    return {
      assignmentTitle: session.assignmentTitle,
      questions: session.questions,
      pacingMode: session.pacingMode || 'student_paced',
      currentQuestionIndex: idx,
      currentQuestionId,
      totalQuestions,
      blackboard: session.blackboard?.[currentQuestionId]
        ? { questionId: currentQuestionId, ...session.blackboard[currentQuestionId] }
        : { questionId: currentQuestionId, workingText: '', showAnswer: false },
    };
  }

  const pool = await getPool();
  const assignmentId = parseInt(String(session.assignmentId), 10);
  if (!assignmentId) throw new Error('Invalid assignmentId on session');

  const aRes = await pool.query('SELECT id, title FROM assignments WHERE id = $1', [assignmentId]);
  if (!aRes.rows.length) throw new Error('Assignment not found');
  const title = aRes.rows[0].title;

  const qRes = await pool.query(
    `SELECT q.id, q.prompt, q.correct_answer, aq.position
     FROM assignment_questions aq
     JOIN questions q ON q.id = aq.question_id
     WHERE aq.assignment_id = $1
     ORDER BY aq.position ASC`,
    [assignmentId]
  );

  const questions = (qRes.rows || []).map((r) => ({ id: String(r.id), text: r.prompt }));
  const correctAnswers = Object.create(null);
  for (const r of qRes.rows || []) {
    if (r.correct_answer !== undefined && r.correct_answer !== null) {
      correctAnswers[String(r.id)] = String(r.correct_answer);
    }
  }

  session.assignmentTitle = title;
  session.questions = questions;
  session.correctAnswers = correctAnswers;

  const totalQuestions = Array.isArray(questions) ? questions.length : 0;
  const idx = Math.max(0, Math.min(totalQuestions - 1, Number(session.currentQuestionIndex ?? 0)));
  const currentQuestionId = totalQuestions ? String(questions[idx]?.id ?? '') : '';

  // correctAnswers stays server-only.
  return {
    assignmentTitle: title,
    questions,
    pacingMode: session.pacingMode || 'student_paced',
    currentQuestionIndex: idx,
    currentQuestionId,
    totalQuestions,
    blackboard: session.blackboard?.[currentQuestionId]
      ? { questionId: currentQuestionId, ...session.blackboard[currentQuestionId] }
      : { questionId: currentQuestionId, workingText: '', showAnswer: false },
  };
}

function roomName(sessionId) {
  return `session_${String(sessionId)}`;
}

function validateBasePayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Missing payload';
  if (!payload.sessionId) return 'Missing sessionId';
  if (!payload.timestamp) return 'Missing timestamp';
  return null;
}

function validateTimestamp(payload) {
  // For stability, accept either ISO string or ms epoch.
  const t = payload?.timestamp;
  if (typeof t === 'number' && Number.isFinite(t)) return null;
  if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) return null;
  return 'Invalid timestamp';
}

function emitSessionUpdate({ io, session, force }) {
  if (!session || session.status !== 'running') return;
  if (!force && !shouldEmitUpdate(session, 2500)) return;

  const agg = computeAggregation(session);
  session.lastAggregation = agg;
  session.lastUpdateEmittedAtMs = nowMs();
  session.updatedAtMs = nowMs();

  io.to(roomName(session.sessionId)).emit('session_update', {
    sessionId: session.sessionId,
    classId: session.classId,
    assignmentId: session.assignmentId,
    startTime: session.startTime,
    status: session.status,
    pacingMode: session.pacingMode || 'student_paced',
    currentQuestionIndex: Number(session.currentQuestionIndex ?? 0),
    ...agg,
  });
}

function emitSessionUpdateAllowEnded({ io, session }) {
  if (!session) return;
  const agg = computeAggregation(session);
  session.lastAggregation = agg;
  session.lastUpdateEmittedAtMs = nowMs();
  session.updatedAtMs = nowMs();

  io.to(roomName(session.sessionId)).emit('session_update', {
    sessionId: session.sessionId,
    classId: session.classId,
    assignmentId: session.assignmentId,
    startTime: session.startTime,
    status: session.status,
    pacingMode: session.pacingMode || 'student_paced',
    currentQuestionIndex: Number(session.currentQuestionIndex ?? 0),
    ...agg,
  });
}

function startSessionTicker({ io, sessionId }) {
  const session = getSession(sessionId);
  if (!session || session.status !== 'running') return null;
  // Keep a handle on the session object (it remains stable in memory).
  const interval = setInterval(() => {
    emitSessionUpdate({ io, session, force: false });
  }, 2500);
  interval.unref?.();
  return interval;
}

function attachSocketServer(httpServer, { corsOrigin = '*', pgPool = null } = {}) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  // sessionId -> interval handle
  const tickers = Object.create(null);

  function ensureTicker(sessionId) {
    const id = String(sessionId);
    if (tickers[id]) return;
    const t = startSessionTicker({ io, sessionId: id });
    if (t) tickers[id] = t;
  }

  function stopTicker(sessionId) {
    const id = String(sessionId);
    const t = tickers[id];
    if (t) clearInterval(t);
    delete tickers[id];
  }

  io.on('connection', (socket) => {
    // MVP: set by join payload
    socket.data.role = null; // teacher | student
    socket.data.sessionId = null;
    socket.data.studentId = null;
    socket.data.teacherId = null;

    // ---- Teacher lifecycle ----
    socket.on('teacher_start_session', (payload, ack) => {
      try {
        const { classId, assignmentId, teacherId, sessionId, timestamp, pacingMode } = payload || {};
        if (!classId || !assignmentId || !timestamp) {
          return ack?.({ ok: false, error: 'Missing classId/assignmentId/timestamp' });
        }
        const tsErr = validateTimestamp({ timestamp });
        if (tsErr) return ack?.({ ok: false, error: tsErr });

        const session = createSession({ classId, assignmentId, teacherId, sessionId });

        // Demo / UX: allow teacher to choose pacing behaviour.
        if (String(pacingMode) === 'teacher_led') {
          session.pacingMode = 'teacher_led';
          session.currentQuestionIndex = 0;
        } else {
          session.pacingMode = 'student_paced';
          session.currentQuestionIndex = 0;
        }

        socket.data.role = 'teacher';
        socket.data.sessionId = session.sessionId;
        socket.data.teacherId = teacherId ? String(teacherId) : null;
        socket.join(roomName(session.sessionId));

        ensureTicker(session.sessionId);
        emitSessionUpdate({ io, session, force: true });

        return ack?.({ ok: true, sessionId: session.sessionId, startTime: session.startTime });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // Teacher-led: advance to next question.
    socket.on('teacher_next_question', async (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });

        const session = getSession(payload.sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });
        if (session.pacingMode !== 'teacher_led') return ack?.({ ok: false, error: 'Session is not teacher-led' });

        // Ensure questions are loaded so we can bound the index.
        const data = await getOrLoadSessionWorksheetData(session);
        const total = Array.isArray(data?.questions) ? data.questions.length : 0;
        if (total <= 0) return ack?.({ ok: false, error: 'No questions loaded' });

        const cur = Number(session.currentQuestionIndex ?? 0);
        const next = Math.min(total - 1, cur + 1);
        session.currentQuestionIndex = next;
        session.updatedAtMs = nowMs();

        const blackboard = session.blackboard?.[String(data.questions[session.currentQuestionIndex]?.id ?? '')] || {
          workingText: '',
          showAnswer: false,
        };

        io.to(roomName(session.sessionId)).emit('teacher_pace_update', {
          sessionId: session.sessionId,
          pacingMode: session.pacingMode,
          currentQuestionIndex: session.currentQuestionIndex,
          currentQuestionId: String(data.questions[session.currentQuestionIndex]?.id ?? ''),
          totalQuestions: total,
          blackboard: {
            questionId: String(data.questions[session.currentQuestionIndex]?.id ?? ''),
            workingText: String(blackboard.workingText || ''),
            showAnswer: Boolean(blackboard.showAnswer),
          },
          timestamp: payload.timestamp,
        });

        emitSessionUpdate({ io, session, force: true });
        return ack?.({ ok: true, currentQuestionIndex: session.currentQuestionIndex, totalQuestions: total });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // Teacher-led: update blackboard state (working + showAnswer) for the current question.
    socket.on('teacher_blackboard_update', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });

        const session = getSession(payload.sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });
        if (session.pacingMode !== 'teacher_led') return ack?.({ ok: false, error: 'Session is not teacher-led' });

        const qid = payload?.questionId !== undefined && payload?.questionId !== null ? String(payload.questionId) : '';
        if (!qid) return ack?.({ ok: false, error: 'Missing questionId' });

        const workingText = payload?.workingText !== undefined && payload?.workingText !== null ? String(payload.workingText) : '';
        const showAnswer = Boolean(payload?.showAnswer);
        if (!session.blackboard) session.blackboard = Object.create(null);
        session.blackboard[qid] = { workingText, showAnswer };
        session.updatedAtMs = nowMs();

        io.to(roomName(session.sessionId)).emit('blackboard_update', {
          sessionId: session.sessionId,
          questionId: qid,
          workingText,
          showAnswer,
          timestamp: payload.timestamp,
        });

        // Also emit a pace update snapshot so late joiners / teacher UI stay aligned.
        // This keeps the blackboard in sync without requiring the client to infer anything.
        if (session.questions && Array.isArray(session.questions)) {
          const total = session.questions.length;
          const idx = Math.max(0, Math.min(total - 1, Number(session.currentQuestionIndex ?? 0)));
          const currentQuestionId = total ? String(session.questions[idx]?.id ?? '') : '';
          io.to(roomName(session.sessionId)).emit('teacher_pace_update', {
            sessionId: session.sessionId,
            pacingMode: session.pacingMode,
            currentQuestionIndex: idx,
            currentQuestionId,
            totalQuestions: total,
            blackboard: { questionId: currentQuestionId, workingText, showAnswer },
            timestamp: payload.timestamp,
          });
        }

        emitSessionUpdate({ io, session, force: true });
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('teacher_join_session', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const session = getSession(payload.sessionId);
        if (!session) return ack?.({ ok: false, error: 'Session not found' });

        socket.data.role = 'teacher';
        socket.data.sessionId = session.sessionId;
        socket.data.teacherId = payload.teacherId ? String(payload.teacherId) : null;
        socket.join(roomName(session.sessionId));

        // Send an immediate snapshot on join.
        // If the session is ended, there is no ticker, but we still want a final snapshot for summary UI.
        if (session.status === 'running') {
          ensureTicker(session.sessionId);
          emitSessionUpdate({ io, session, force: true });
        } else {
          emitSessionUpdateAllowEnded({ io, session });
        }

        return ack?.({ ok: true, sessionId: session.sessionId, status: session.status });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('teacher_end_session', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const session = endSession(payload.sessionId);
        if (!session) return ack?.({ ok: false, error: 'Session not found' });

        stopTicker(session.sessionId);
        // Broadcast one final update reflecting ended status.
        emitSessionUpdateAllowEnded({ io, session });

        // Persist report snapshot.
        // 1) Always keep in-memory copy (fast UI)
        // 2) If pgPool provided, also store in DB for persistence.
        try {
          const report = buildSessionReport(session);
          saveReport(report);
          if (pgPool) {
            // eslint-disable-next-line global-require
            const reportsDb = require('./reportsDb');
            reportsDb.saveReport(pgPool, report).catch((err) => {
              console.error('[report-db] save failed:', err);
            });
          }
        } catch (err) {
          // Report generation should never block ending the session.
          console.error('[report] build/save failed:', err);
        }

        // Student-side explicit end event.
        io.to(roomName(session.sessionId)).emit('session_ended', {
          sessionId: session.sessionId,
          endTime: session.endTime,
        });

        return ack?.({ ok: true, sessionId: session.sessionId, endTime: session.endTime });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // Teacher can resolve a specific raised hand (student + question).
    // This re-enables the student's Raise Hand button for that question.
    socket.on('teacher_resolve_hand', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const { sessionId, studentId, questionId } = payload;
        if (!studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (questionId === undefined || questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(sessionId);
        if (!session) return ack?.({ ok: false, error: 'Session not found' });

        clearRaisedHand(session, studentId, questionId);
        emitSessionUpdate({ io, session, force: true });

        io.to(roomName(session.sessionId)).emit('hand_resolved', {
          sessionId: session.sessionId,
          studentId: String(studentId),
          questionId: String(questionId),
        });

        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // ---- Student lifecycle & events ----
    socket.on('student_join', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        if (!payload.studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        const session = getSession(payload.sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, payload.studentId);
        if (payload.name) student.name = String(payload.name);
        recordActivity(student);

        socket.data.role = 'student';
        socket.data.sessionId = session.sessionId;
        socket.data.studentId = String(payload.studentId);

        socket.join(roomName(session.sessionId));
        emitSessionUpdate({ io, session, force: true });

        // Send student-facing worksheet data (session_data)
        // Lazy-load from DB once per session.
        getOrLoadSessionWorksheetData(session)
          .then((data) => {
            socket.emit('session_data', data);

            if (String(session.pacingMode) === 'teacher_led') {
              const total = Number(data?.totalQuestions ?? 0);
              const idx = Number(data?.currentQuestionIndex ?? 0);
              const qid = String(data?.currentQuestionId ?? '');
              socket.emit('teacher_pace_update', {
                sessionId: session.sessionId,
                pacingMode: 'teacher_led',
                currentQuestionIndex: idx,
                currentQuestionId: qid,
                totalQuestions: total,
                blackboard: data?.blackboard || { questionId: qid, workingText: '', showAnswer: false },
                timestamp: payload.timestamp,
              });
            }
          })
          .catch((err) => {
            socket.emit('session_data', { error: String(err?.message || err) });
          });

        return ack?.({ ok: true, sessionId: session.sessionId });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('student_activity', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        if (!payload.studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        const session = getSession(payload.sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, payload.studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);

        // No forced update; ticker will pick up inactivity changes.
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // Student indicates they are working on / focused on a specific question.
    // Used for the "spent > 1 min" heuristic on teacher Live Insights.
    socket.on('student_question_focus', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const { sessionId, studentId, questionId } = payload;
        if (!studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (questionId === undefined || questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);
        const qid = String(questionId);

        // Track per-question first focus time (used for report solve-time stats).
        const pq = student.perQuestion[qid] || {
          questionId: qid,
          attempts: 0,
          correct: 0,
          wrong: 0,
          firstFocusedAtMs: null,
          solveMs: null,
        };
        if (!pq.firstFocusedAtMs) pq.firstFocusedAtMs = nowMs();
        student.perQuestion[qid] = pq;

        if (student.currentQuestionId !== qid) {
          student.currentQuestionId = qid;
          student.currentQuestionStartedAtMs = nowMs();
          session.updatedAtMs = nowMs();
        }
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    // Student marks a question as difficult (toggle).
    socket.on('student_mark_difficult', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const { sessionId, studentId, questionId, marked } = payload;
        if (!studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (questionId === undefined || questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);

        const qid = String(questionId);
        if (!session.difficultMarks[qid]) session.difficultMarks[qid] = Object.create(null);
        if (marked === false) {
          delete session.difficultMarks[qid][String(studentId)];
        } else {
          session.difficultMarks[qid][String(studentId)] = true;
        }
        session.updatedAtMs = nowMs();

        emitSessionUpdate({ io, session, force: true });
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('student_answered', async (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const { sessionId, studentId, questionId } = payload;
        if (!studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (questionId === undefined || questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        // Determine correctness (rule-based) if we have correct answers loaded.
        let isCorrect = null;
        try {
          await getOrLoadSessionWorksheetData(session);
          const expected = session.correctAnswers?.[String(questionId)];
          if (expected !== undefined && expected !== null && expected !== '') {
            const submitted = String(payload.answer ?? '');
            isCorrect = answersEquivalent(submitted, String(expected));
          }
        } catch {
          // If DB is down or not configured, just accept event without correctness.
        }

        const student = ensureStudent(session, studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);

        const qid = String(questionId);
        const pq = student.perQuestion[qid] || {
          questionId: qid,
          attempts: 0,
          correct: 0,
          wrong: 0,
          firstFocusedAtMs: null,
          solveMs: null,
        };
        pq.attempts += 1;
        if (isCorrect === false) pq.wrong += 1;
        if (isCorrect === true) pq.correct += 1;
        student.perQuestion[qid] = pq;

        const qs = ensureQuestionStats(session.questionStats, questionId);
        qs.attempts += 1;
        if (isCorrect === false) qs.wrong += 1;
        if (isCorrect === true) qs.correct += 1;

        // Track which students have submitted an answer for this question at least once.
        // Used for teacher-led live metrics.
        if (!session.answeredByQuestion) session.answeredByQuestion = Object.create(null);
        if (!session.answeredByQuestion[qid]) session.answeredByQuestion[qid] = Object.create(null);
        session.answeredByQuestion[qid][String(studentId)] = true;
        session.updatedAtMs = nowMs();

        // Record "time to solve" on first correct event for this student+question.
        // Uses focus start time if present; otherwise uses the current-question timer.
        if (isCorrect === true && pq.solveMs === null) {
          const now = nowMs();
          let startedAt = null;
          if (student.currentQuestionId && String(student.currentQuestionId) === qid && student.currentQuestionStartedAtMs) {
            startedAt = student.currentQuestionStartedAtMs;
          } else if (pq.firstFocusedAtMs) {
            startedAt = pq.firstFocusedAtMs;
          }
          if (startedAt) {
            pq.solveMs = Math.max(0, now - startedAt);
            student.perQuestion[qid] = pq;
          }
        }

        // Success typically resolves a raised hand (optional UX):
        if (isCorrect === true) {
          clearRaisedHand(session, studentId, questionId);
          socket.emit('hand_resolved', { sessionId, studentId: String(studentId), questionId: String(questionId) });
        }

        // Reset time tracking for that question (student "finished" it)
        if (student.currentQuestionId && String(student.currentQuestionId) === qid) {
          student.currentQuestionStartedAtMs = null;
        }

        socket.emit('answer_result', {
          sessionId,
          studentId: String(studentId),
          questionId: String(questionId),
          isCorrect,
        });

        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('student_wrong_attempt', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        const { sessionId, studentId, questionId } = payload;
        if (!studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (questionId === undefined || questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);

        const qid = String(questionId);
        const pq = student.perQuestion[qid] || {
          questionId: qid,
          attempts: 0,
          correct: 0,
          wrong: 0,
          firstFocusedAtMs: null,
          solveMs: null,
        };
        pq.attempts += 1;
        pq.wrong += 1;
        student.perQuestion[qid] = pq;

        const qs = ensureQuestionStats(session.questionStats, questionId);
        qs.attempts += 1;
        qs.wrong += 1;
        session.updatedAtMs = nowMs();

        // Wrong attempts are important teacher signals; emit quickly.
        emitSessionUpdate({ io, session, force: true });

        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('student_raised_hand', (payload, ack) => {
      try {
        const baseErr = validateBasePayload(payload);
        if (baseErr) return ack?.({ ok: false, error: baseErr });
        const tsErr = validateTimestamp(payload);
        if (tsErr) return ack?.({ ok: false, error: tsErr });
        if (!payload.studentId) return ack?.({ ok: false, error: 'Missing studentId' });
        if (payload.questionId === undefined || payload.questionId === null) return ack?.({ ok: false, error: 'Missing questionId' });

        const session = getSession(payload.sessionId);
        if (!session || session.status !== 'running') return ack?.({ ok: false, error: 'Session not running' });

        const student = ensureStudent(session, payload.studentId);
        recordActivity(student);
        if (payload?.name && !student.name) student.name = String(payload.name);
        addRaisedHand(session, payload.studentId, payload.questionId, payload.timestamp);

        // Raised hands should appear quickly.
        emitSessionUpdate({ io, session, force: true });

        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, error: String(err?.message || err) });
      }
    });

    socket.on('disconnect', () => {
      // MVP: we do not immediately remove student from session on disconnect.
      // We rely on inactivity rule, which is more stable for spotty WiFi.
    });
  });

  return { io };
}

module.exports = {
  attachSocketServer,
  emitSessionUpdate,
  emitSessionUpdateAllowEnded,
  roomName,
};
