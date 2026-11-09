/*
End-to-end verification for Live Session (teacher alerts + student worksheet).

Usage:
  PGPASSWORD=123456 PORT=5000 node server.js
  node realtime/verifyLiveSession.js

This script will:

 1) Ensure a CW exists (and has questions) via /api/seed-cw
2) Start a live session as teacher
3) Join 3 students
4) Verify students receive session_data with questions
5) Generate raised-hand + struggling + low-accuracy signals
6) Print observed aggregated updates
*/

const { io } = require('socket.io-client');

const BASE_URL = process.env.SOCKET_URL || process.env.API_URL || 'http://localhost:5000';

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function httpJson(path, options) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}: ${text || ''}`.trim());
  }
  return json;
}

async function main() {
  const teacherId = 1;
  const classId = 1;

  // Ensure CW + questions exist
  await httpJson('/api/seed-cw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacherId, classId }),
  });

  const cwList = await httpJson(`/api/classes/${classId}/assignments?type=cw`);
  const assignmentId = cwList?.[0]?.id;
  if (!assignmentId) throw new Error('No CW assignment found after seeding');

  const teacher = io(BASE_URL, { transports: ['polling', 'websocket'] });
  const teacherUpdates = [];

  await new Promise((resolve, reject) => {
    teacher.on('connect', resolve);
    teacher.on('connect_error', reject);
  });

  const startAck = await new Promise((resolve) => {
    teacher.emit(
      'teacher_start_session',
      {
        classId: String(classId),
        assignmentId: String(assignmentId),
        teacherId: String(teacherId),
        timestamp: Date.now(),
      },
      resolve
    );
  });
  if (!startAck?.ok) throw new Error(`teacher_start_session failed: ${startAck?.error || 'unknown'}`);
  const sessionId = startAck.sessionId;
  console.log('[verify] sessionId', sessionId);

  teacher.on('session_update', (u) => {
    if (u?.sessionId !== sessionId) return;
    teacherUpdates.push(u);
  });

  async function joinStudent(n) {
    const studentId = `verify_s${n}`;
    const s = io(BASE_URL, { transports: ['polling', 'websocket'] });
    await new Promise((resolve, reject) => {
      s.on('connect', resolve);
      s.on('connect_error', reject);
    });

    const sessionData = await new Promise((resolve) => {
      s.once('session_data', resolve);
      s.emit('student_join', { sessionId, studentId, name: `Student ${n}`, timestamp: Date.now() }, () => {});
    });

    const qCount = Array.isArray(sessionData?.questions) ? sessionData.questions.length : 0;
    console.log(`[verify] student ${n} got session_data:`, sessionData?.assignmentTitle, 'questions=', qCount);
    if (!sessionData?.assignmentTitle || qCount < 1) {
      throw new Error(`student ${n} session_data missing worksheet`);
    }

    return { socket: s, studentId, firstQuestionId: String(sessionData.questions[0].id) };
  }

  const s1 = await joinStudent(1);
  const s2 = await joinStudent(2);
  const s3 = await joinStudent(3);

  // Raised hand on question 1
  s1.socket.emit('student_raised_hand', {
    sessionId,
    studentId: s1.studentId,
    questionId: s1.firstQuestionId,
    timestamp: Date.now(),
  });

  // Struggling: 3 students with >=2 wrong on same question
  // Use student_wrong_attempt to deterministically increment wrong attempts,
  // regardless of DB correctness availability.
  for (const s of [s1, s2, s3]) {
    s.socket.emit('student_wrong_attempt', {
      sessionId,
      studentId: s.studentId,
      questionId: s.firstQuestionId,
      timestamp: Date.now(),
    });
    s.socket.emit('student_wrong_attempt', {
      sessionId,
      studentId: s.studentId,
      questionId: s.firstQuestionId,
      timestamp: Date.now(),
    });
  }

  // Low accuracy: push attempts >= 5 with low accuracy
  s1.socket.emit('student_wrong_attempt', {
    sessionId,
    studentId: s1.studentId,
    questionId: s1.firstQuestionId,
    timestamp: Date.now(),
  });
  s2.socket.emit('student_wrong_attempt', {
    sessionId,
    studentId: s2.studentId,
    questionId: s2.firstQuestionId,
    timestamp: Date.now(),
  });

  await sleep(3000);

  const last = teacherUpdates[teacherUpdates.length - 1];
  console.log('[verify] last session_update snapshot:', {
    raisedHandCount: last?.raisedHandCount,
    strugglingCount: last?.strugglingCount,
    lowAccuracyQuestions: last?.lowAccuracyQuestions,
    alerts: last?.alerts,
  });

  // Cleanup
  s1.socket.disconnect();
  s2.socket.disconnect();
  s3.socket.disconnect();
  teacher.disconnect();

  console.log('[verify] done');
}

main().catch((err) => {
  console.error('[verify] failed:', err.message || err);
  process.exitCode = 1;
});
