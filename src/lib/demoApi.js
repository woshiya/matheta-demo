import {
  DEMO_ASSIGNMENTS,
  DEMO_CLASSES,
  DEMO_LIVE_SESSIONS,
  DEMO_SUBMISSIONS,
  DEMO_USERS,
  DEMO_CLASS_STUDENTS,
  DEMO_EXTRA_STUDENTS,
} from './mockDb';

function jsonResponse(data, init) {
  // Response is available in modern browsers; Netlify deployment is browser-only.
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function notFound(message) {
  return new Response(JSON.stringify({ error: message || 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Minimal subset of the backend API used by the UI.
// This is intentionally read-only and deterministic.
export async function demoFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();

  // Normalize calls that incorrectly include API_BASE_URL in the string.
  // In demo mode, callers should pass paths like `/api/...`, but some code may
  // pass `http://host/api/...`. Strip to pathname + search.
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      path = `${u.pathname}${u.search}`;
    }
  } catch {
    // ignore
  }

  // Login
  if (path === '/login' && method === 'POST') {
    let body = {};
    try {
      body = JSON.parse(options.body || '{}');
    } catch {
      body = {};
    }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (password !== 'password123') {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (email === 'teacher@demo.com') return jsonResponse(DEMO_USERS.teacher);
    if (email === 'student1@demo.com') return jsonResponse(DEMO_USERS.student);
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Teacher classes
  {
    const m = path.match(/^\/api\/teachers\/([^/]+)\/classes$/);
    if (m && method === 'GET') {
      return jsonResponse(DEMO_CLASSES);
    }
  }

  // Student classes
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/classes$/);
    if (m && method === 'GET') {
      return jsonResponse(DEMO_CLASSES);
    }
  }

  // Student dashboard tiles
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/class-summary$/);
    if (m && method === 'GET') {
      // Keep schema loose; UI treats it as an array.
      return jsonResponse(
        DEMO_CLASSES.map((c) => ({
          class_id: c.id,
          class_name: c.name,
          hw_count: DEMO_ASSIGNMENTS.filter((a) => a.class_id === c.id && a.type === 'hw').length,
          cw_count: DEMO_ASSIGNMENTS.filter((a) => a.class_id === c.id && a.type === 'cw').length,
        }))
      );
    }
  }
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/class-cards$/);
    if (m && method === 'GET') {
      return jsonResponse(
        DEMO_CLASSES.map((c) => ({
          class_id: c.id,
          class_name: c.name,
          hw_count: DEMO_ASSIGNMENTS.filter((a) => a.class_id === c.id && a.type === 'hw').length,
          cw_count: DEMO_ASSIGNMENTS.filter((a) => a.class_id === c.id && a.type === 'cw').length,
          upcoming_count: 0,
          missed_count: 0,
        }))
      );
    }
  }
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/insights\/recent$/);
    if (m && method === 'GET') {
      return jsonResponse({
        assignments: DEMO_ASSIGNMENTS.slice(0, 3).map((a) => ({
          assignment_id: a.id,
          title: a.title,
          class_id: a.class_id,
          type: a.type,
          status: a.status,
        })),
        weakAreas: ['sign errors', 'rearranging equations'],
        strongAreas: ['mental arithmetic', 'pattern spotting'],
      });
    }
  }

  // Class detail (teacher)
  {
    const m = path.match(/^\/api\/classes\/([^/]+)$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      const c = DEMO_CLASSES.find((x) => Number(x.id) === classId);
      if (!c) return notFound('Class not found');
      return jsonResponse({
        id: c.id,
        name: c.name,
        subjects: c.subjects,
        students: DEMO_CLASS_STUDENTS?.[String(c.id)] || DEMO_CLASS_STUDENTS?.[c.id] || [DEMO_USERS.student],
      });
    }
  }

  // Class student analytics (teacher)
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/student-analytics$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      const students = (DEMO_CLASS_STUDENTS?.[String(classId)] || DEMO_CLASS_STUDENTS?.[classId] || [DEMO_USERS.student]).map((s, idx) => ({
        student_id: s.id,
        name: s.name,
        email: s.email,
        progress: idx === 0 && classId === 1 ? 64 : idx === 0 && classId === 2 ? 73 : 68,
        completed_homework: classId === 1 ? 2 : 4,
        missed_homework: classId === 1 ? 1 : 0,
      }));
      return jsonResponse({
        students,
      });
    }
  }

  // Domain radar (student and teacher variants)
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/students\/([^/]+)\/domain-radar(\?.*)?$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      const studentId = String(m[2]);
      const is3A = classId === 1;
      const is4C = classId === 2;
      const isStudent3A = studentId === String(DEMO_EXTRA_STUDENTS.student3A.id);
      const isStudent4C = studentId === String(DEMO_EXTRA_STUDENTS.student4C.id);

      // Slightly different profiles per class/student so the teacher view looks real.
      const baseline = is3A && isStudent3A
        ? [
            { domain_key: 'number', percent: 66 },
            { domain_key: 'algebra', percent: 52 },
            { domain_key: 'measures', percent: 55 },
            { domain_key: 'shape_space', percent: 44 },
            { domain_key: 'data_handling', percent: 48 },
          ]
        : is4C && isStudent4C
          ? [
              { domain_key: 'number', percent: 58 },
              { domain_key: 'algebra', percent: 60 },
              { domain_key: 'measures', percent: 62 },
              { domain_key: 'shape_space', percent: 54 },
              { domain_key: 'data_handling', percent: 46 },
            ]
          : [
              { domain_key: 'number', percent: 62 },
              { domain_key: 'algebra', percent: 55 },
              { domain_key: 'measures', percent: 58 },
              { domain_key: 'shape_space', percent: 46 },
              { domain_key: 'data_handling', percent: 40 },
            ];

      const current = is3A && isStudent3A
        ? [
            { domain_key: 'number', percent: 60 },
            { domain_key: 'algebra', percent: 50 },
            { domain_key: 'measures', percent: 51 },
            { domain_key: 'shape_space', percent: 63 },
            { domain_key: 'data_handling', percent: 70 },
          ]
        : is4C && isStudent4C
          ? [
              { domain_key: 'number', percent: 65 },
              { domain_key: 'algebra', percent: 66 },
              { domain_key: 'measures', percent: 68 },
              { domain_key: 'shape_space', percent: 57 },
              { domain_key: 'data_handling', percent: 54 },
            ]
          : [
              { domain_key: 'number', percent: 58 },
              { domain_key: 'algebra', percent: 50 },
              { domain_key: 'measures', percent: 52 },
              { domain_key: 'shape_space', percent: 60 },
              { domain_key: 'data_handling', percent: 68 },
            ];

      return jsonResponse({
        baseline: {
          domainScores: baseline,
        },
        current: {
          domainScores: current,
        },
      });
    }
  }

  // Diagnostic centre demo endpoints
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/diagnostic-sessions\/active$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      // Keep one deterministic session id per class.
      return jsonResponse({
        session: {
          id: `DEMO-DIAG-${classId}`,
          status: 'active',
          ends_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        },
      });
    }
  }
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/diagnostic-sessions$/);
    if (m && method === 'POST') {
      const classId = Number(m[1]);
      return jsonResponse({
        session: {
          id: `DEMO-DIAG-${classId}`,
          status: 'active',
          ends_at: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        },
      });
    }
  }
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/diagnostic-sessions\/([^/]+)\/close$/);
    if (m && method === 'POST') {
      return jsonResponse({
        session: {
          id: String(m[2]),
          status: 'closed',
          ends_at: new Date().toISOString(),
        },
      });
    }
  }
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/diagnostic-sessions\/([^/]+)\/results(\?.*)?$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      const students = (DEMO_CLASS_STUDENTS?.[String(classId)] || DEMO_CLASS_STUDENTS?.[classId] || []).map((s) => {
        const is3A = classId === 1;
        const domain_scores = [
          { domain_key: 'number', percent: is3A ? 62 : 70 },
          { domain_key: 'algebra', percent: is3A ? 48 : 66 },
          { domain_key: 'measures', percent: is3A ? 55 : 64 },
          { domain_key: 'shape_space', percent: is3A ? 60 : 58 },
          { domain_key: 'data_handling', percent: is3A ? 68 : 52 },
        ];
        return {
          student_id: s.id,
          student_name: s.name,
          attempt_status: 'submitted',
          submitted_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          domain_scores,
        };
      });
      return jsonResponse({ students });
    }
  }

  // Risk + thresholds (teacher)
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/thresholds$/);
    if (m && method === 'GET') {
      return jsonResponse({ high_risk_threshold: 50, mastery_threshold: 70 });
    }
    if (m && method === 'POST') {
      return jsonResponse({ ok: true });
    }
  }
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/risk(\?.*)?$/);
    if (m && method === 'GET') {
      return jsonResponse({
        students: [
          {
            student_id: DEMO_USERS.student.id,
            system_label: 'developing',
            override_label: null,
            final_label: 'developing',
            reason: 'Demo data',
          },
        ],
      });
    }
  }
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/risk-overrides$/);
    if (m && method === 'POST') {
      // Accept and pretend it persisted.
      return jsonResponse({ ok: true });
    }
  }

  // Adaptive difficulty (teacher)
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/students\/([^/]+)\/adaptive-difficulty(\?.*)?$/);
    if (m && method === 'GET') {
      return jsonResponse({
        tier: 2,
        recommended: [
          { domain_key: 'data_handling', topic_key: 'bar_charts', label: 'Reading bar charts', difficulty: 'medium' },
          { domain_key: 'shape_space', topic_key: 'angles', label: 'Angles', difficulty: 'easy' },
        ],
      });
    }
  }

  // Practice recommendations (student)
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/classes\/([^/]+)\/practice-recommendations(\?.*)?$/);
    if (m && method === 'GET') {
      return jsonResponse({
        recommendations: [
          {
            topic_id: 301,
            topic_name: 'Angles',
            domain_name: 'Shape & Space',
            domain_key: 'shape_space',
            topic_key: 'angles',
            tier: 1,
          },
          {
            topic_id: 302,
            topic_name: 'Bar Charts',
            domain_name: 'Data Handling',
            domain_key: 'data_handling',
            topic_key: 'bar_charts',
            tier: 2,
          },
        ],
      });
    }
  }

  // Student class assignments
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/classes\/([^/]+)\/assignments$/);
    if (m && method === 'GET') {
      const classId = Number(m[2]);
      // In the real backend this is filtered by role/enrollment and not include drafts.
      const list = DEMO_ASSIGNMENTS.filter((a) => a.class_id === classId && a.status !== 'draft').map((a) => ({
        ...a,
        my_submission_status: 'submitted',
        my_score: 8,
        my_max_score: 10,
      }));
      return jsonResponse(list);
    }
  }

  // Student assignment detail
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/assignments\/([^/]+)$/);
    if (m && method === 'GET') {
      const assignmentId = Number(m[2]);
      const a = DEMO_ASSIGNMENTS.find((x) => x.id === assignmentId);
      if (!a) return notFound('Assignment not found');
      // Shape it like backend: { assignment, questions, answers, submission }
      const questions = [
        { id: 1, prompt: 'Solve: 2x + 3 = 11', points: 2 },
        { id: 2, prompt: 'Solve: 5x - 10 = 0', points: 2 },
        { id: 3, prompt: 'Solve: x/3 = 4', points: 2 },
        { id: 4, prompt: 'Solve: 3(x + 2) = 18', points: 2 },
        { id: 5, prompt: 'Solve: 7 + x = 15', points: 2 },
      ];
      return jsonResponse({
        assignment: { ...a, grading_mode: 'auto' },
        questions,
        answers: [],
        submission: { id: 7001, status: 'submitted', score: 8, max_score: 10 },
      });
    }
  }
  // Student answer save/submit (no-op)
  {
    const m = path.match(/^\/api\/students\/([^/]+)\/assignments\/([^/]+)\/(answer|submit)$/);
    if (m && method === 'POST') {
      const action = m[3];
      if (action === 'answer') {
        return jsonResponse({ ok: true, isCorrect: null, pointsAwarded: null });
      }
      return jsonResponse({ ok: true });
    }
  }

  // Widget settings (teacher) - stored in localStorage for the demo.
  {
    const m = path.match(/^\/api\/widget-settings\/([^/?]+)(\?.*)?$/);
    if (m && (method === 'GET' || method === 'POST')) {
      const url = new URL(`http://demo.local${path}`);
      const classId = url.searchParams.get('classId') || 'global';
      const key = `matheta:demo:widgets:${m[1]}:${classId}`;
      if (method === 'GET') {
        try {
          const raw = localStorage.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Array.isArray(parsed.widgets)) return jsonResponse(parsed);
        } catch {
          // ignore
        }
        return jsonResponse({ widgets: null });
      }
      // POST
      try {
        const body = JSON.parse(options.body || '{}');
        localStorage.setItem(key, JSON.stringify({ widgets: body.widgets }));
      } catch {
        // ignore
      }
      return jsonResponse({ ok: true });
    }
  }

  // Teacher assignment summary
  {
    const m = path.match(/^\/api\/teachers\/([^/]+)\/assignment-summary$/);
    if (m && method === 'GET') {
      // Match backend shape: rows of { class_id, type, assignments_count, assigned_count, completed_count }
      const rows = [];
      for (const c of DEMO_CLASSES) {
        for (const type of ['hw', 'cw']) {
          const list = DEMO_ASSIGNMENTS.filter((a) => a.class_id === c.id && a.type === type);
          rows.push({
            class_id: c.id,
            type,
            assignments_count: list.length,
            assigned_count: type === 'cw' ? 1 : 1,
            completed_count: type === 'cw' ? 1 : 0,
          });
        }
      }
      return jsonResponse(rows);
    }
  }

  // Assignments by class
  {
    const m = path.match(/^\/api\/classes\/([^/]+)\/assignments(\?.*)?$/);
    if (m && method === 'GET') {
      const classId = Number(m[1]);
      const url = new URL(`http://demo.local${path}`);
      const type = url.searchParams.get('type');
      let list = DEMO_ASSIGNMENTS.filter((a) => a.class_id === classId);
      if (type) list = list.filter((a) => a.type === type);
      return jsonResponse(list);
    }
  }

  // Assignment detail
  {
    const m = path.match(/^\/api\/assignments\/([^/]+)$/);
    if (m && method === 'GET') {
      const id = Number(m[1]);
      const a = DEMO_ASSIGNMENTS.find((x) => x.id === id);
      if (!a) return notFound('Assignment not found');
      return jsonResponse(a);
    }
  }

  // Public assignment detail (used by some pages)
  {
    const m = path.match(/^\/api\/assignments\/([^/]+)\/public$/);
    if (m && method === 'GET') {
      const id = Number(m[1]);
      const a = DEMO_ASSIGNMENTS.find((x) => x.id === id);
      if (!a) return notFound('Assignment not found');
      return jsonResponse(a);
    }
  }

  // Submissions list for assignment
  {
    const m = path.match(/^\/api\/assignments\/([^/]+)\/submissions$/);
    if (m && method === 'GET') {
      const assignmentId = Number(m[1]);
      return jsonResponse(
        DEMO_SUBMISSIONS.filter((s) => s.assignment_id === assignmentId)
      );
    }
  }

  // Submission detail
  {
    const m = path.match(/^\/api\/submissions\/([^/]+)$/);
    if (m && method === 'GET') {
      const submissionId = Number(m[1]);
      const s = DEMO_SUBMISSIONS.find((x) => x.id === submissionId);
      if (!s) return notFound('Submission not found');
      return jsonResponse(s);
    }
  }

  // Live-session reports (read-only demo)
  if (path.startsWith('/api/realtime/reports') && method === 'GET') {
    // /api/realtime/reports?teacherId=...
    if (path === '/api/realtime/reports' || path.startsWith('/api/realtime/reports?')) {
      return jsonResponse(
        DEMO_LIVE_SESSIONS.map((s) => ({
          sessionId: s.sessionId,
          classId: s.classId,
          teacherId: s.teacherId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
        }))
      );
    }
    // /api/realtime/reports/:sessionId
    const m = path.match(/^\/api\/realtime\/reports\/([^/]+)$/);
    if (m) {
      const sessionId = m[1];
      const s = DEMO_LIVE_SESSIONS.find((x) => x.sessionId === sessionId);
      if (!s) return notFound('Report not found');
      return jsonResponse(s);
    }
  }

  // Seed endpoint used by the realtime setup page.
  if (path === '/api/seed-cw' && method === 'POST') {
    // Pretend we created/seeded an assignment and return its id.
    return jsonResponse({ ok: true, assignmentId: DEMO_ASSIGNMENTS[0]?.id || 1001 });
  }

  // Default: if a screen calls an unimplemented endpoint, return 501 so it's obvious.
  return new Response(
    JSON.stringify({
      error: 'Demo API: endpoint not implemented',
      path,
      method,
    }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  );
}
