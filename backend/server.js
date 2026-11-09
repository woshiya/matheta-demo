const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("crypto");
const http = require('http');
const path = require('path');

const { attachSocketServer } = require('./realtime/socket');
const attachStudentDashboardRoutes = require('./studentDashboard');
const { answersEquivalent } = require('./marking');
const attachStudentDashboardSeedRoutes = require('./demoStudentDashboard');

// Diagnostic answer key (server authoritative)
const { DIAGNOSTIC_QUESTIONS } = require('./diagnosticBank');

function diagnosticDomainKeyFromLabel(label) {
  const s = String(label || '').trim().toLowerCase();
  if (s === 'number') return 'number';
  if (s === 'algebra') return 'algebra';
  if (s === 'measures') return 'measures';
  if (s === 'shape & space' || s === 'shape and space' || s === 'shape_space') return 'shape_space';
  if (s === 'data handling' || s === 'data_handling') return 'data_handling';
  return null;
}

function normalizeDiagnosticOption(value) {
  // Make diagnostic marking tolerant to degree symbol and whitespace.
  return String(value ?? '')
    .replace(/\u00B0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const DIAGNOSTIC_BY_ID = new Map(
  (DIAGNOSTIC_QUESTIONS || []).map((q) => [
    Number(q.id),
    {
      id: Number(q.id),
      expected: String(q.answer ?? ''),
      domainKey: diagnosticDomainKeyFromLabel(q.domain),
    },
  ])
);

// Load .env if present (local dev)
try {
  // eslint-disable-next-line global-require
  // Load backend/.env regardless of the current working directory.
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch {
  // ignore
}
const app = express();
app.set("startedAt", new Date().toISOString());

// CORS: frontend is hosted separately (e.g. Vercel) and calls this API.
// Be explicit so OPTIONS preflights (e.g. POST /login with JSON) succeed.
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
// Express v5's router no longer accepts the plain "*" pattern.
app.options(/.*/, cors(corsOptions));

app.use(express.json());

function buildPgConfigFromEnv() {
  // Prefer a single connection string if present.
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      // Optional SSL support if you later point this at a hosted DB.
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    };
  }

  // Fall back to discrete env vars (works well for local dev).
  return {
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'matheta_system',
    // pg's SCRAM auth expects a string password.
    // If PGPASSWORD is missing, using '' avoids the confusing "password must be a string" crash.
    // For local dev, set PGPASSWORD in backend/.env or your shell.
    password: String(process.env.PGPASSWORD ?? ""),
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  };
}

const pool = new Pool(buildPgConfigFromEnv());

// --- Demo/bootstrapping ---
// Render Postgres starts empty. For this demo app we auto-create the minimal core tables
// and seed demo users/classes so hosted deployments work without manual SQL.
let _coreInitPromise = null;
async function ensureCoreTablesExist(clientOrPool) {
  // Users
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('teacher','student')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // Classes
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );`
  );

  // Memberships
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS class_memberships (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      membership_type TEXT NOT NULL CHECK (membership_type IN ('teacher','student')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, user_id, membership_type)
    );`
  );

  // Subjects (required by assignment seed/data)
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );`
  );

  // Assignments (core)
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('hw','cw')),
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      answers_visible BOOLEAN NOT NULL DEFAULT FALSE,
      grading_mode VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (grading_mode IN ('auto','manual')),
      due_at TIMESTAMP,
      scheduled_at TIMESTAMP,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS assignments_class_id_idx ON assignments(class_id);");

  // Recipients (used by dashboard counts)
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS assignment_recipients (
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (assignment_id, student_id)
    );`
  );

  // Optional: class_subjects (some endpoints check existence)
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS class_subjects (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, subject_id)
    );`
  );

  // Student analytics used by teacher class page
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS student_details (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      progress NUMERIC(5,2) NOT NULL DEFAULT 0,
      strengths TEXT[] NOT NULL DEFAULT '{}'::text[],
      improvements TEXT[] NOT NULL DEFAULT '{}'::text[],
      completed_homework INTEGER NOT NULL DEFAULT 0,
      missed_homework INTEGER NOT NULL DEFAULT 0,
      homework_missing TEXT[] NOT NULL DEFAULT '{}'::text[],
      PRIMARY KEY (class_id, user_id)
    );`
  );
}

async function seedDemoCoreData(clientOrPool) {
  // Seed subjects
  await clientOrPool.query(
    `INSERT INTO subjects (name) VALUES ('Mathematics')
     ON CONFLICT (name) DO NOTHING;`
  );
  await clientOrPool.query(
    `INSERT INTO subjects (name) VALUES ('English')
     ON CONFLICT (name) DO NOTHING;`
  );

  // Seed classes with stable ids (used across UI/routes)
  await clientOrPool.query(
    `INSERT INTO classes (id, name) VALUES
      (1, '3A - Maths'),
      (2, '4C - Maths')
     ON CONFLICT (id) DO NOTHING;`
  );
  // Keep sequence in sync if we inserted explicit ids
  await clientOrPool.query(
    `SELECT setval(pg_get_serial_sequence('classes','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM classes), 1));`
  );

  // Seed demo users
  const teacherRes = await clientOrPool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'teacher')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['Demo Teacher', 'teacher@demo.com', 'password123']
  );
  const teacherId = teacherRes.rows?.[0]?.id;

  const studentRes = await clientOrPool.query(
    `INSERT INTO users (name, email, password, role)
     VALUES ($1, $2, $3, 'student')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    ['Student One', 'student1@demo.com', 'password123']
  );
  const studentId = studentRes.rows?.[0]?.id;

  // Demo classwork seed:
  // - Older versions inserted a "Warm-up Quiz" on every boot (no unique constraint => no conflict)
  //   which could flood the assignments list.
  // - We now keep exactly one demo CW assignment and rename any legacy "Warm-up Quiz" to the
  //   new demo title.
  if (teacherId) {
    const demoTitle = 'Algebra Linear Equations AI Generated Qs - Demo';
    const legacyTitle = 'Warm-up Quiz';

    // Prefer keeping the newest of the legacy/new demo assignments and delete the rest.
    const existing = await clientOrPool.query(
      `SELECT id, title
       FROM assignments
       WHERE class_id = 1
         AND created_by = $1
         AND title = ANY($2::text[])
       ORDER BY created_at DESC, id DESC`,
      [teacherId, [demoTitle, legacyTitle]]
    );

    if (existing.rows.length) {
      const keepId = existing.rows[0].id;
      await clientOrPool.query(
        `UPDATE assignments
         SET title = $2,
             description = COALESCE(NULLIF(description, ''), 'AI-generated practice questions on algebra and linear equations.'),
             updated_at = NOW()
         WHERE id = $1`,
        [keepId, demoTitle]
      );

      const extraIds = existing.rows.slice(1).map((r) => r.id).filter(Boolean);
      if (extraIds.length) {
        await clientOrPool.query(
          `DELETE FROM assignments
           WHERE id = ANY($1::int[])`,
          [extraIds]
        );
      }
    } else {
      // Create one demo CW assignment if none exists.
      await clientOrPool.query(
        `INSERT INTO assignments (class_id, type, title, description, status, created_by, scheduled_at)
         VALUES (1, 'cw', $2, 'AI-generated practice questions on algebra and linear equations.', 'published', $1, NOW())`,
        [teacherId, demoTitle]
      );
    }
  }

  // Memberships
  if (teacherId) {
    await clientOrPool.query(
      `INSERT INTO class_memberships (class_id, user_id, membership_type)
       VALUES (1, $1, 'teacher'), (2, $1, 'teacher')
       ON CONFLICT DO NOTHING;`,
      [teacherId]
    );
  }
  if (studentId) {
    await clientOrPool.query(
      `INSERT INTO class_memberships (class_id, user_id, membership_type)
       VALUES (1, $1, 'student')
       ON CONFLICT DO NOTHING;`,
      [studentId]
    );
    await clientOrPool.query(
      `INSERT INTO student_details (class_id, user_id, progress, strengths, improvements)
       VALUES (1, $1, 55.6, ARRAY['Algebra','Fractions'], ARRAY['Triangles','Angles'])
       ON CONFLICT (class_id, user_id) DO NOTHING;`,
      [studentId]
    );
  }
}

function ensureCoreInitOnce() {
  if (_coreInitPromise) return _coreInitPromise;
  _coreInitPromise = (async () => {
    try {
      await ensureCoreTablesExist(pool);
      await seedDemoCoreData(pool);
    } catch (err) {
      console.error('[core-init] failed:', err);
    }
  })();
  return _coreInitPromise;
}

// Kick off init early; routes that need DB should be resilient even if this fails.
ensureCoreInitOnce();

async function waitForCoreInit() {
  try {
    await ensureCoreInitOnce();
  } catch {
    // ignore
  }
}

// Student dashboard endpoints (overview + insights)
attachStudentDashboardRoutes(app, pool);

// Helpers for dashboards
attachStudentDashboardSeedRoutes(app, pool);

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";

// Supabase support removed. This repo currently stores images as URLs/data URLs.

app.get("/api/health", async (req, res) => {
  const startedAt = req.app.get("startedAt") || null;
  const status = {
    ok: true,
    degraded: false,
    uptimeSeconds: Math.round(process.uptime()),
    startedAt,
    db: { ok: false },
    n8n: { configured: Boolean(N8N_WEBHOOK_URL), ok: null },
  };

  // Expose a safe subset of DB config for debugging.
  // Never return passwords.
  try {
    const cfg = buildPgConfigFromEnv();
    status.db = {
      ...status.db,
      config: {
      host: cfg.host || null,
      port: cfg.port || null,
      database: cfg.database || null,
      user: cfg.user || null,
      passwordPresent: Boolean(cfg.password),
      usesDatabaseUrl: Boolean(process.env.DATABASE_URL),
      },
    };
  } catch {
    // ignore
  }

  try {
    const r = await pool.query("SELECT NOW() AS now");
    status.db = { ...status.db, ok: true, now: r.rows?.[0]?.now || null };
  } catch (err) {
    status.db = { ...status.db, ok: false, error: String(err?.message || err) };
    status.degraded = true;
  }

  // n8n "ok" only indicates whether the webhook endpoint is reachable.
  // It doesn't validate your workflow's inner nodes.
  if (N8N_WEBHOOK_URL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ping: true }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      status.n8n.ok = r.ok;
      if (!r.ok) status.degraded = true;
    } catch (err) {
      status.n8n.ok = false;
      status.n8n.error = String(err?.message || err);
      status.degraded = true;
    }
  }

  // For local/dev: the backend can still be useful (realtime) even if DB/n8n are not.
  // Report service failures via `degraded` instead of failing the whole health endpoint.
  res.status(200).json(status);
});

app.get("/", (req, res) => {
  res.send("Matheta backend running ✅");
});

// Optional: list live sessions for debugging (in-memory, resets on restart)
try {
  // eslint-disable-next-line global-require
  const { listSessions } = require('./realtime/sessionsStore');
  app.get('/api/realtime/sessions', (req, res) => {
    const sessions = listSessions().map((s) => ({
      sessionId: s.sessionId,
      classId: s.classId,
      assignmentId: s.assignmentId,
      status: s.status,
      startTime: s.startTime,
      endTime: s.endTime,
      activeStudents: Object.keys(s.students || {}).length,
      raisedHandCount: (s.raisedHands || []).length,
      updatedAtMs: s.updatedAtMs,
    }));
    res.json({ sessions });
  });
} catch {
  // ignore
}

// Real-time session reports
// Prefer DB persistence; fall back to in-memory if DB is unavailable.
try {
  // eslint-disable-next-line global-require
  const reportsDb = require('./realtime/reportsDb');
  // eslint-disable-next-line global-require
  const reportsMem = require('./realtime/reportsStore');

  let _seededReportsOnce = false;

  async function sanitizeSeedArtifactsOnce() {
    if (_seededReportsOnce) return;
    _seededReportsOnce = true;
    if (process.env.NODE_ENV === 'production') return;
    const legacyTitlePrefix = `${String.fromCharCode(68, 101, 109, 111)} Classwork - `;
    const legacySessionPrefix = `${String.fromCharCode(100, 101, 109, 111)}_report_`;
    try {
      // Keep user-visible labels clean. This only touches legacy/dev seed values.
      await pool.query(
        `UPDATE assignments
         SET title = 'Classwork - ' || substring(title from char_length($1) + 1)
         WHERE title LIKE ($1 || '%')`,
        [legacyTitlePrefix]
      );
    } catch {
      // ignore
    }

    try {
      await reportsDb.ensureLiveSessionReportsTable(pool);
      // Update stored assignment title column.
      await pool.query(
        `UPDATE live_session_reports
         SET assignment_title = 'Classwork - ' || substring(assignment_title from char_length($1) + 1)
         WHERE assignment_title LIKE ($1 || '%')`,
        [legacyTitlePrefix]
      );

      // Update any legacy session ids.
      const rows = await pool.query(
        `SELECT session_id
         FROM live_session_reports
         WHERE session_id LIKE ($1 || '%')
         ORDER BY session_id`,
        [legacySessionPrefix]
      );
      for (const r of rows.rows || []) {
        const oldId = String(r.session_id);
        const newId = oldId.replace(legacySessionPrefix, 'report_');
        if (newId === oldId) continue;
        await pool.query(
          `UPDATE live_session_reports
           SET session_id = $2,
               report = jsonb_set(report, '{sessionId}', to_jsonb($2::text), true)
           WHERE session_id = $1`,
          [oldId, newId]
        );
      }
    } catch {
      // ignore
    }
  }

  async function seedPastReportsIfNone({ teacherId }) {
    // Dev-only convenience: ensure the reports list isn't empty for first-time users.
    if (process.env.NODE_ENV === 'production') return;
    if (!teacherId) return;
    const tid = parseInt(String(teacherId), 10);
    if (!Number.isFinite(tid) || tid <= 0) return;

    await reportsDb.ensureLiveSessionReportsTable(pool);
    const existing = await reportsDb.listReports(pool, { teacherId: tid });
    if (existing.length > 0) return;

    // Pick up to 2 classes for the teacher.
    const classesRes = await pool.query(
      `SELECT c.id, c.name
       FROM classes c
       JOIN class_memberships cm
         ON cm.class_id = c.id
        AND cm.user_id = $1
        AND cm.membership_type = 'teacher'
       ORDER BY c.id
       LIMIT 2`,
      [tid]
    );

    const classes = classesRes.rows || [];
    if (classes.length === 0) return;

    const now = Date.now();
    for (let i = 0; i < classes.length; i++) {
      const c = classes[i];

      // Ensure there's at least one published assignment for the class.
      let assignment = null;
      try {
        const aRes = await pool.query(
          `SELECT id, title
           FROM assignments
           WHERE class_id = $1 AND status = 'published'
           ORDER BY created_at DESC
           LIMIT 1`,
          [c.id]
        );
        assignment = aRes.rows?.[0] || null;
      } catch {
        assignment = null;
      }

      if (!assignment) {
        // Minimal insert; if schema differs, the catch will just skip seeding.
        const title = `Classwork - ${c.name}`;
        try {
          const ins = await pool.query(
            `INSERT INTO assignments (class_id, type, title, description, status, created_by, scheduled_at)
             VALUES ($1, 'cw', $2, 'Automatically created for previous session history', 'published', $3, NOW())
             RETURNING id, title`,
            [c.id, title, tid]
          );
          assignment = ins.rows?.[0] || null;
        } catch {
          // If we cannot create an assignment, still seed a report shell with no assignment.
          assignment = null;
        }
      }

      const endedAt = new Date(now - (i + 1) * 6 * 60 * 60 * 1000);
      const startedAt = new Date(endedAt.getTime() - 32 * 60 * 1000);
      const sessionId = `report_${endedAt.getTime()}_${Math.floor(Math.random() * 1e6)}`;
      const assignmentTitle = assignment?.title || `Class ${c.name}`;

      const report = {
        kind: 'session_report',
        sessionId,
        teacherId: tid,
        classId: c.id,
        assignmentId: assignment?.id ?? null,
        assignmentTitle,
        reportName: 'Session report',
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        summary: {
          activeStudents: 6,
          raisedHandCount: 1,
          strugglingCount: 2,
          inactiveCount: 0,
          lowAccuracyQuestions: [{ questionId: '1', accuracy: 40 }],
          alerts: {
            raisedHands: true,
            struggling: true,
            lowAccuracy: true,
            inactivity: false,
          },
        },
        students: [],
      };

      await reportsDb.saveReport(pool, report);
    }
  }

  app.get('/api/realtime/reports', async (req, res) => {
    const teacherId = req.query.teacherId;
    try {
      await sanitizeSeedArtifactsOnce();
      await seedPastReportsIfNone({ teacherId });
      const reports = await reportsDb.listReports(pool, { teacherId });
      return res.json({ reports });
    } catch (err) {
      console.error('[GET] reports db failed, falling back to memory:', err);
      const reports = reportsMem.listReports({ teacherId });
      return res.json({
        reports: reports.map((r) => ({
          sessionId: r.sessionId,
          classId: r.classId,
          assignmentId: r.assignmentId,
          assignmentTitle: r.assignmentTitle,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          summary: r.summary,
        })),
      });
    }
  });

  app.get('/api/realtime/reports/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    try {
      const report = await reportsDb.getReport(pool, sessionId);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      return res.json(report);
    } catch (err) {
      console.error('[GET] report db failed, falling back to memory:', err);
      const report = reportsMem.getReport(sessionId);
      if (!report) return res.status(404).json({ error: 'Report not found' });
      return res.json(report);
    }
  });
} catch {
  // ignore
}
app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database connection failed" });
  }
});
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT id, name, email, role FROM users WHERE email = $1 AND password = $2",
      [email, password]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// List users for login dropdowns (never returns passwords)
app.get("/api/users", async (req, res) => {
  const role = String(req.query.role || "").toLowerCase();
  const params = [];
  let where = "";
  if (role === "teacher" || role === "student") {
    params.push(role);
    where = "WHERE role = $1";
  }
  try {
    const r = await pool.query(
      `SELECT id, name, email, role
       FROM users
       ${where}
       ORDER BY role, id`,
      params
    );
    res.json(Array.isArray(r.rows) ? r.rows : []);
  } catch (err) {
    console.error("[GET] Users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// List classes a teacher belongs to
app.get("/api/teachers/:teacherId/classes", async (req, res) => {
  const teacherId = parseInt(req.params.teacherId);
  if (!teacherId) return res.status(400).json({ error: "Missing or invalid teacherId" });
  try {
    const hasClassSubjects = await pool.query(
      "SELECT to_regclass('public.class_subjects') IS NOT NULL AS exists"
    );
    const classSubjectsExists = Boolean(hasClassSubjects.rows?.[0]?.exists);

    if (!classSubjectsExists) {
      const result = await pool.query(
         `SELECT
           c.id,
           c.name,
           (COUNT(DISTINCT cms.user_id) FILTER (WHERE cms.membership_type = 'student'))::int AS student_count
         FROM classes c
         JOIN class_memberships cm
           ON cm.class_id = c.id
          AND cm.user_id = $1
          AND cm.membership_type = 'teacher'
         LEFT JOIN class_memberships cms
           ON cms.class_id = c.id
         GROUP BY c.id, c.name
         ORDER BY c.id`,
        [teacherId]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         COALESCE(array_remove(array_agg(DISTINCT s.name), NULL), '{}') AS subjects,
         (COUNT(DISTINCT cms.user_id) FILTER (WHERE cms.membership_type = 'student'))::int AS student_count
       FROM classes c
       JOIN class_memberships cm ON cm.class_id = c.id
       LEFT JOIN class_memberships cms ON cms.class_id = c.id
       LEFT JOIN class_subjects cs ON cs.class_id = c.id
       LEFT JOIN subjects s ON s.id = cs.subject_id
       WHERE cm.user_id = $1 AND cm.membership_type = 'teacher'
       GROUP BY c.id, c.name
       ORDER BY c.id`,
      [teacherId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[GET] Teacher classes error:", err);
    res.status(500).json({ error: "Failed to fetch teacher classes" });
  }
});

// List classes a student belongs to
app.get("/api/students/:studentId/classes", async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  if (!studentId) return res.status(400).json({ error: "Missing or invalid studentId" });
  try {
    const hasClassSubjects = await pool.query(
      "SELECT to_regclass('public.class_subjects') IS NOT NULL AS exists"
    );
    const classSubjectsExists = Boolean(hasClassSubjects.rows?.[0]?.exists);

    if (!classSubjectsExists) {
      const result = await pool.query(
        `SELECT
           c.id,
           c.name,
           (COUNT(DISTINCT cmT.user_id) FILTER (WHERE cmT.membership_type = 'teacher'))::int AS teacher_count
         FROM classes c
         JOIN class_memberships cm
           ON cm.class_id = c.id
          AND cm.user_id = $1
          AND cm.membership_type = 'student'
         LEFT JOIN class_memberships cmT
           ON cmT.class_id = c.id
         GROUP BY c.id, c.name
         ORDER BY c.id`,
        [studentId]
      );
      return res.json(result.rows);
    }

    const result = await pool.query(
      `SELECT
         c.id,
         c.name,
         COALESCE(array_remove(array_agg(DISTINCT s.name), NULL), '{}') AS subjects,
         (COUNT(DISTINCT cmT.user_id) FILTER (WHERE cmT.membership_type = 'teacher'))::int AS teacher_count
       FROM classes c
       JOIN class_memberships cm
         ON cm.class_id = c.id
        AND cm.user_id = $1
        AND cm.membership_type = 'student'
       LEFT JOIN class_memberships cmT ON cmT.class_id = c.id
       LEFT JOIN class_subjects cs ON cs.class_id = c.id
       LEFT JOIN subjects s ON s.id = cs.subject_id
       GROUP BY c.id, c.name
       ORDER BY c.id`,
      [studentId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[GET] Student classes error:", err);
    res.status(500).json({ error: "Failed to fetch student classes" });
  }
});

// Student: list assignments for a class they are enrolled in
// Returns only non-draft assignments.
app.get('/api/students/:studentId/classes/:classId/assignments', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const classId = parseInt(req.params.classId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });

  const client = await pool.connect();
  try {
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentSubmissionTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);

    const membership = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!membership.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    const result = await client.query(
      `SELECT
         a.*,
         COALESCE(q.question_count, 0)::int AS question_count
       FROM assignments a
       LEFT JOIN (
         SELECT assignment_id, COUNT(*)::int AS question_count
         FROM assignment_questions
         GROUP BY assignment_id
       ) q ON q.assignment_id = a.id
       WHERE a.class_id = $1 AND a.status <> 'draft'
       ORDER BY a.created_at DESC`,
      [classId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('[GET] Student class assignments error:', err);
    return res.status(500).json({ error: 'Failed to fetch assignments' });
  } finally {
    client.release();
  }
});
// Get real class data and students/teachers/analytics
app.get('/api/classes/:id', async (req, res) => {
  const classId = parseInt(req.params.id);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  try {
    await waitForCoreInit();
    // Get class info
    const classResult = await pool.query('SELECT id, name FROM classes WHERE id = $1', [classId]);
    if (classResult.rows.length === 0) return res.status(404).json({ error: 'Class not found' });

    // Optional: subjects (many-to-many) if class_subjects table exists
    const hasClassSubjects = await pool.query(
      "SELECT to_regclass('public.class_subjects') IS NOT NULL AS exists"
    );
    const classSubjectsExists = Boolean(hasClassSubjects.rows?.[0]?.exists);
    let subjects = [];
    if (classSubjectsExists) {
      const subjectsResult = await pool.query(
        `SELECT s.name
         FROM class_subjects cs
         JOIN subjects s ON s.id = cs.subject_id
         WHERE cs.class_id = $1
         ORDER BY s.name`,
        [classId]
      );
      subjects = subjectsResult.rows.map((r) => r.name);
    }

    // Get memberships (teachers and students)
    const memberships = await pool.query(
      `SELECT cm.user_id, cm.membership_type, u.name, u.email, u.role
       FROM class_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE class_id = $1
       ORDER BY cm.membership_type, u.id`, [classId]
    );
    // Get student analytics (table exists in hosted demo; keep endpoint resilient)
    let analytics = { rows: [] };
    try {
      analytics = await pool.query(
        'SELECT user_id, progress, strengths, improvements, completed_homework, missed_homework, homework_missing FROM student_details WHERE class_id = $1',
        [classId]
      );
    } catch (err) {
      console.error('[GET] Class detail analytics query failed:', err);
      analytics = { rows: [] };
    }
    // Build response
    const students = [];
    const teachers = [];
    for (const m of memberships.rows) {
      if (m.membership_type === 'student') {
        // Merge analytics
        const analytic = analytics.rows.find(a => a.user_id === m.user_id) || {};
        students.push({
          id: m.user_id,
          name: m.name,
          email: m.email,
          progress: analytic.progress || 0,
          strengths: analytic.strengths || [],
          improvements: analytic.improvements || [],
          completed_homework: analytic.completed_homework || 0,
          missed_homework: analytic.missed_homework || 0,
          homework_missing: analytic.homework_missing || []
        });
      } else if (m.membership_type === 'teacher') {
        teachers.push({ id: m.user_id, name: m.name, email: m.email });
      }
    }
    res.json({
      id: classResult.rows[0].id,
      name: classResult.rows[0].name,
      subjects,
      students,
      teachers
    });
  } catch (err) {
    console.error('[GET] Class detail error:', err);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({
        error: 'Failed to fetch class details',
        detail: String(err?.message || err),
      });
    }
    res.status(500).json({ error: 'Failed to fetch class details' });
  }
});

// Teacher: start a diagnostic session for a class (45 minutes by default)
// Body: { teacherId, durationMinutes? }
app.post('/api/classes/:classId/diagnostic-sessions', async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  const teacherId = req.body?.teacherId;
  if (!teacherId || isNaN(+teacherId)) return res.status(400).json({ error: 'Missing teacherId' });
  const durationMinutes = req.body?.durationMinutes;
  const duration = durationMinutes !== undefined && durationMinutes !== null && !isNaN(+durationMinutes)
    ? Math.max(1, parseInt(durationMinutes, 10))
    : 45;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDiagnosticTablesExist(client);

    // Validate teacher membership
    const m = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'teacher'
       LIMIT 1`,
      [classId, parseInt(teacherId, 10)]
    );
    if (!m.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a teacher of this class' });
    }

    // Close any existing active sessions for this class
    await client.query(
      `UPDATE diagnostic_sessions
       SET status = 'closed'
       WHERE class_id = $1 AND status = 'active'`,
      [classId]
    );

    const sRes = await client.query(
      `INSERT INTO diagnostic_sessions (class_id, created_by, status, duration_minutes, starts_at, ends_at)
       VALUES ($1, $2, 'active', $3, NOW(), NOW() + make_interval(mins => $3))
       RETURNING *`,
      [classId, parseInt(teacherId, 10), duration]
    );

    await client.query('COMMIT');
    res.json({ session: sRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Start diagnostic session error:', err);
    res.status(500).json({ error: 'Failed to start diagnostic session' });
  } finally {
    client.release();
  }
});

// Teacher: close an active diagnostic session early
// Body: { teacherId }
app.post('/api/classes/:classId/diagnostic-sessions/:sessionId/close', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  const teacherId = req.body?.teacherId;
  if (!classId || !sessionId) return res.status(400).json({ error: 'Missing classId or sessionId' });
  if (!teacherId || isNaN(+teacherId)) return res.status(400).json({ error: 'Missing teacherId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDiagnosticTablesExist(client);

    const m = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'teacher'
       LIMIT 1`,
      [classId, parseInt(teacherId, 10)]
    );
    if (!m.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a teacher of this class' });
    }

    const updated = await client.query(
      `UPDATE diagnostic_sessions
       SET status = 'closed', ends_at = NOW()
       WHERE id = $1 AND class_id = $2 AND status = 'active'
       RETURNING *`,
      [sessionId, classId]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active session not found' });
    }

    // Mark any in-progress attempts as expired.
    await client.query(
      `UPDATE diagnostic_attempts
       SET status = 'expired'
       WHERE session_id = $1 AND status = 'in_progress'`,
      [sessionId]
    );

    await client.query('COMMIT');
    return res.json({ session: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Close diagnostic session error:', err);
    return res.status(500).json({ error: 'Failed to close diagnostic session' });
  } finally {
    client.release();
  }
});

// Student: fetch active diagnostic session for a class
app.get('/api/classes/:classId/diagnostic-sessions/active', async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  try {
    await ensureDiagnosticTablesExist(pool);
    const r = await pool.query(
      `SELECT *
       FROM diagnostic_sessions
       WHERE class_id = $1 AND status = 'active' AND NOW() < ends_at
       ORDER BY id DESC
       LIMIT 1`,
      [classId]
    );
    res.json({ session: r.rows[0] || null });
  } catch (err) {
    console.error('[GET] Active diagnostic session error:', err);
    res.status(500).json({ error: 'Failed to fetch active diagnostic session' });
  }
});

// Fetch a diagnostic session by id (used by student client polling)
app.get('/api/classes/:classId/diagnostic-sessions/:sessionId', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  if (!classId || !sessionId) return res.status(400).json({ error: 'Missing classId or sessionId' });
  try {
    await ensureDiagnosticTablesExist(pool);
    const r = await pool.query(
      `SELECT *
       FROM diagnostic_sessions
       WHERE id = $1 AND class_id = $2
       LIMIT 1`,
      [sessionId, classId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Session not found' });
    return res.json({ session: r.rows[0] });
  } catch (err) {
    console.error('[GET] Diagnostic session error:', err);
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Teacher: results for a session (per student latest attempt)
app.get('/api/classes/:classId/diagnostic-sessions/:sessionId/results', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  const teacherId = req.query?.teacherId;
  if (!classId || !sessionId) return res.status(400).json({ error: 'Missing classId or sessionId' });
  if (!teacherId || isNaN(+teacherId)) return res.status(400).json({ error: 'Missing teacherId' });

  const client = await pool.connect();
  try {
    await ensureDiagnosticTablesExist(client);
    // Validate teacher membership
    const m = await client.query(
      `SELECT 1 FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'teacher'
       LIMIT 1`,
      [classId, parseInt(teacherId, 10)]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });

    // Validate session belongs to class
    const s = await client.query(
      `SELECT id FROM diagnostic_sessions WHERE id = $1 AND class_id = $2`,
      [sessionId, classId]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Session not found' });

    // Get students in class
    const studentsRes = await client.query(
      `SELECT u.id AS student_id, u.name AS student_name
       FROM class_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = $1 AND cm.membership_type = 'student'
       ORDER BY u.id`,
      [classId]
    );

    const attemptsRes = await client.query(
      `SELECT a.id, a.student_id, a.status, a.started_at, a.submitted_at
       FROM diagnostic_attempts a
       WHERE a.session_id = $1
       ORDER BY a.started_at DESC`,
      [sessionId]
    );
    const byStudent = new Map();
    for (const a of attemptsRes.rows || []) {
      // Keep most recent attempt per student.
      const k = String(a.student_id);
      if (!byStudent.has(k)) byStudent.set(k, a);
    }

    // Prefer stored domain_scores; otherwise compute from diagnostic_answers.
    const scoresRes = await client.query(
      `SELECT ds.attempt_id, ds.domain_key, ds.correct, ds.total, ds.percent
       FROM diagnostic_domain_scores ds
       JOIN diagnostic_attempts a ON a.id = ds.attempt_id
       WHERE a.session_id = $1`,
      [sessionId]
    );

    const attemptIds = (attemptsRes.rows || []).map((a) => a.id).filter(Boolean);
    const computedRes = attemptIds.length
      ? await client.query(
          `WITH per AS (
             SELECT attempt_id,
                    domain_key,
                    COUNT(*) FILTER (WHERE is_correct IS TRUE)::int AS correct,
                    COUNT(*)::int AS total
             FROM diagnostic_answers
             WHERE attempt_id = ANY($1::int[]) AND domain_key IS NOT NULL
             GROUP BY attempt_id, domain_key
           )
           SELECT attempt_id,
                  domain_key,
                  correct,
                  total,
                  CASE WHEN total = 0 THEN 0 ELSE ROUND((correct::float / total) * 100)::int END AS percent
           FROM per
           ORDER BY attempt_id, domain_key`,
          [attemptIds]
        )
      : { rows: [] };

    const scoresByAttempt = new Map();
    for (const r of scoresRes.rows || []) {
      const k = String(r.attempt_id);
      const list = scoresByAttempt.get(k) || [];
      list.push(r);
      scoresByAttempt.set(k, list);
    }
    for (const r of computedRes.rows || []) {
      const k = String(r.attempt_id);
      if (scoresByAttempt.has(k)) continue; // already has stored domain_scores
      const list = scoresByAttempt.get(k) || [];
      list.push(r);
      scoresByAttempt.set(k, list);
    }

    const out = (studentsRes.rows || []).map((srow) => {
      const attempt = byStudent.get(String(srow.student_id)) || null;
      const attemptId = attempt?.id ? String(attempt.id) : null;
      return {
        student_id: srow.student_id,
        student_name: srow.student_name,
        attempt_status: attempt?.status || 'not_started',
        started_at: attempt?.started_at || null,
        submitted_at: attempt?.submitted_at || null,
        domain_scores: attemptId ? (scoresByAttempt.get(attemptId) || []) : [],
      };
    });

    res.json({ students: out });
  } catch (err) {
    console.error('[GET] Diagnostic results error:', err);
    res.status(500).json({ error: 'Failed to fetch diagnostic results' });
  } finally {
    client.release();
  }
});

// Student: start (or resume) a diagnostic attempt for an active session
// Body: { studentId }
app.post('/api/classes/:classId/diagnostic-sessions/:sessionId/attempts', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  const studentId = parseInt(req.body?.studentId);
  if (!classId || !sessionId) return res.status(400).json({ error: 'Missing classId or sessionId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

  const client = await pool.connect();
  try {
    await ensureDiagnosticTablesExist(client);

    // Validate student membership
    const m = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    // Validate session belongs to class and is active
    const s = await client.query(
      `SELECT id, status, ends_at
       FROM diagnostic_sessions
       WHERE id = $1 AND class_id = $2`,
      [sessionId, classId]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = s.rows[0];
    if (String(session.status) !== 'active') return res.status(403).json({ error: 'Session is not active' });

    // If ended by time, treat as closed for taking attempts
    const endsAt = session.ends_at ? new Date(session.ends_at) : null;
    if (endsAt && !Number.isNaN(endsAt.getTime()) && Date.now() >= endsAt.getTime()) {
      return res.status(403).json({ error: 'Session has ended' });
    }

    // Upsert attempt
    const a = await client.query(
      `INSERT INTO diagnostic_attempts (session_id, student_id, status, started_at)
       VALUES ($1, $2, 'in_progress', NOW())
       ON CONFLICT (session_id, student_id) DO UPDATE
         SET status = CASE
           WHEN diagnostic_attempts.status = 'submitted' THEN 'submitted'
           ELSE 'in_progress'
         END
       RETURNING id, session_id, student_id, status, started_at, submitted_at`,
      [sessionId, studentId]
    );

    return res.json({ attempt: a.rows[0] });
  } catch (err) {
    console.error('[POST] Start diagnostic attempt error:', err);
    return res.status(500).json({ error: 'Failed to start diagnostic attempt' });
  } finally {
    client.release();
  }
});

// Student: persist a single diagnostic answer (server-authoritative marking)
// Body: { studentId, questionId, selectedOption }
app.post('/api/classes/:classId/diagnostic-sessions/:sessionId/attempts/:attemptId/answer', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  const attemptId = parseInt(req.params.attemptId);
  const studentId = parseInt(req.body?.studentId);
  const questionId = parseInt(req.body?.questionId);
  const selectedOption = req.body?.selectedOption !== undefined && req.body?.selectedOption !== null ? String(req.body.selectedOption) : null;

  if (!classId || !sessionId || !attemptId) return res.status(400).json({ error: 'Missing classId/sessionId/attemptId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!questionId) return res.status(400).json({ error: 'Missing or invalid questionId' });

  const key = DIAGNOSTIC_BY_ID.get(questionId) || null;
  if (!key?.domainKey) return res.status(400).json({ error: 'Unknown diagnostic questionId' });

  const client = await pool.connect();
  try {
    await ensureDiagnosticTablesExist(client);

    // Validate student membership
    const m = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    // Validate session belongs to class and is active
    const s = await client.query(
      `SELECT id, status, ends_at
       FROM diagnostic_sessions
       WHERE id = $1 AND class_id = $2`,
      [sessionId, classId]
    );
    if (!s.rows.length) return res.status(404).json({ error: 'Session not found' });
    const session = s.rows[0];
    if (String(session.status) !== 'active') return res.status(403).json({ error: 'Session is not active' });
    const endsAt = session.ends_at ? new Date(session.ends_at) : null;
    if (endsAt && !Number.isNaN(endsAt.getTime()) && Date.now() >= endsAt.getTime()) {
      return res.status(403).json({ error: 'Session has ended' });
    }

    // Validate attempt ownership
    const a = await client.query(
      `SELECT id, status
       FROM diagnostic_attempts
       WHERE id = $1 AND session_id = $2 AND student_id = $3`,
      [attemptId, sessionId, studentId]
    );
    if (!a.rows.length) return res.status(404).json({ error: 'Attempt not found' });
    if (String(a.rows[0].status) === 'submitted') return res.status(409).json({ error: 'Attempt already submitted' });

    const isCorrect = selectedOption === null
      ? null
      : normalizeDiagnosticOption(selectedOption) === normalizeDiagnosticOption(key.expected);

    await client.query(
      `INSERT INTO diagnostic_answers (attempt_id, question_id, selected_option, is_correct, domain_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET selected_option = EXCLUDED.selected_option,
             is_correct = EXCLUDED.is_correct,
             domain_key = EXCLUDED.domain_key`,
      [attemptId, questionId, selectedOption, isCorrect, key.domainKey]
    );

    return res.json({ ok: true, isCorrect });
  } catch (err) {
    console.error('[POST] Diagnostic answer error:', err);
    return res.status(500).json({ error: 'Failed to save answer' });
  } finally {
    client.release();
  }
});

// Student: submit a diagnostic attempt (writes domain scores + optional answers)
// Body: { studentId, domainScores?: [...], answers?: [{ questionId, selectedOption }] }
app.post('/api/classes/:classId/diagnostic-sessions/:sessionId/attempts/:attemptId/submit', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const sessionId = parseInt(req.params.sessionId);
  const attemptId = parseInt(req.params.attemptId);
  const studentId = parseInt(req.body?.studentId);
  const domainScores = req.body?.domainScores;
  const answers = req.body?.answers;

  if (!classId || !sessionId || !attemptId) return res.status(400).json({ error: 'Missing classId/sessionId/attemptId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  // domainScores are optional; backend will compute authoritative scores from stored answers.

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDiagnosticTablesExist(client);

    // Validate student membership
    const m = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }

    // Validate session
    const s = await client.query(
      `SELECT id, status, ends_at
       FROM diagnostic_sessions
       WHERE id = $1 AND class_id = $2`,
      [sessionId, classId]
    );
    if (!s.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = s.rows[0];
    if (String(session.status) !== 'active') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Session is not active' });
    }
    const endsAt = session.ends_at ? new Date(session.ends_at) : null;
    if (endsAt && !Number.isNaN(endsAt.getTime()) && Date.now() >= endsAt.getTime()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Session has ended' });
    }

    // Validate attempt ownership
    const a = await client.query(
      `SELECT id, status
       FROM diagnostic_attempts
       WHERE id = $1 AND session_id = $2 AND student_id = $3`,
      [attemptId, sessionId, studentId]
    );
    if (!a.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attempt not found' });
    }
    if (String(a.rows[0].status) === 'submitted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Attempt already submitted' });
    }

    // Upsert domain scores
    // Optional: accept answers in the submit payload, but compute correctness server-side.
    if (Array.isArray(answers)) {
      for (const ans of answers) {
        const qid = parseInt(ans?.questionId);
        if (!qid) continue;
        const key = DIAGNOSTIC_BY_ID.get(qid) || null;
        if (!key?.domainKey) continue;
        const selectedOption = ans?.selectedOption !== undefined && ans?.selectedOption !== null ? String(ans.selectedOption) : null;
        const isCorrect = selectedOption === null
          ? null
          : normalizeDiagnosticOption(selectedOption) === normalizeDiagnosticOption(key.expected);
        await client.query(
          `INSERT INTO diagnostic_answers (attempt_id, question_id, selected_option, is_correct, domain_key)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (attempt_id, question_id) DO UPDATE
             SET selected_option = EXCLUDED.selected_option,
                 is_correct = EXCLUDED.is_correct,
                 domain_key = EXCLUDED.domain_key`,
          [attemptId, qid, selectedOption, isCorrect, key.domainKey]
        );
      }
    }

    // Compute authoritative per-domain scores for this attempt.
    // Missing answers count as incorrect (fixed totals from the diagnostic bank).
    const answersRes = await client.query(
      `SELECT question_id, is_correct
       FROM diagnostic_answers
       WHERE attempt_id = $1`,
      [attemptId]
    );
    const isCorrectByQid = new Map((answersRes.rows || []).map((r) => [Number(r.question_id), r.is_correct]));

    const totals = new Map();
    const corrects = new Map();
    for (const q of DIAGNOSTIC_QUESTIONS || []) {
      const qid = Number(q.id);
      const domainKey = diagnosticDomainKeyFromLabel(q.domain);
      if (!qid || !domainKey) continue;
      totals.set(domainKey, (totals.get(domainKey) || 0) + 1);
      const c = isCorrectByQid.get(qid);
      if (c === true) corrects.set(domainKey, (corrects.get(domainKey) || 0) + 1);
    }

    for (const [domainKey, total] of totals.entries()) {
      const correct = corrects.get(domainKey) || 0;
      const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
      await client.query(
        `INSERT INTO diagnostic_domain_scores (attempt_id, domain_key, correct, total, percent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (attempt_id, domain_key)
         DO UPDATE SET correct = $3, total = $4, percent = $5`,
        [attemptId, domainKey, correct, total, percent]
      );
    }

    const updated = await client.query(
      `UPDATE diagnostic_attempts
       SET status = 'submitted', submitted_at = NOW()
       WHERE id = $1
       RETURNING id, status, submitted_at`,
      [attemptId]
    );

    // Pin a baseline the first time a student submits a diagnostic in this class.
    // This keeps dashboards stable even if the student takes additional diagnostics later.
    await client.query(
      `INSERT INTO diagnostic_baselines (class_id, student_id, attempt_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, student_id) DO NOTHING`,
      [classId, studentId, attemptId]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, attempt: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Submit diagnostic attempt error:', err);
    return res.status(500).json({ error: 'Failed to submit diagnostic attempt' });
  } finally {
    client.release();
  }
});
// GET widget settings for a user (support per-class and global)
app.get('/api/widget-settings/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  let classId = req.query.classId;
  classId = (classId !== undefined && classId !== null && classId !== '' && !isNaN(+classId)) ? parseInt(classId, 10) : null;
  console.log('[GET] Widget Settings', { userId, classId });
  if (!userId) return res.status(400).json({ error: 'Missing or invalid userId' });
  try {
    let result;
    // Prefer per-class config if classId provided
    if (classId !== null) {
      result = await pool.query(
        'SELECT widget_config FROM widget_settings WHERE user_id = $1 AND class_id = $2',
        [userId, classId]
      );
      if (result.rows.length) {
        const cfg = result.rows[0].widget_config;
        // Back-compat: some older rows store a raw array instead of { widgets: [...] }
        if (Array.isArray(cfg)) return res.json({ widgets: cfg });
        if (cfg && Array.isArray(cfg.widgets)) return res.json(cfg);
        return res.json({ widgets: null });
      }
    }
    // Fallback to global config (class_id IS NULL)
    result = await pool.query(
      'SELECT widget_config FROM widget_settings WHERE user_id = $1 AND class_id IS NULL',
      [userId]
    );
    if (result.rows.length) {
      const cfg = result.rows[0].widget_config;
      if (Array.isArray(cfg)) return res.json({ widgets: cfg });
      if (cfg && Array.isArray(cfg.widgets)) return res.json(cfg);
      return res.json({ widgets: null });
    }
    res.json({ widgets: null });
  } catch (err) {
    console.error('[GET] Widget Settings error:', err);
    res.status(500).json({ error: 'Failed to fetch widget settings' });
  }
});
// POST (create or update) widget settings for a user (support per-class and global)
app.post('/api/widget-settings/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  let classId = req.query.classId;
  classId = (classId !== undefined && classId !== null && classId !== '' && !isNaN(+classId)) ? parseInt(classId, 10) : null;
  const widgetConfig = req.body.widgets;
  console.log('[POST] Widget Settings', { userId, classId, widgetConfig });
  if (!userId || !Array.isArray(widgetConfig)) {
    return res.status(400).json({ error: 'Missing userId or widget config' });
  }
  try {
    const stored = { widgets: widgetConfig };
    const upsert = await pool.query(
      `INSERT INTO widget_settings (user_id, class_id, widget_config, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT(user_id, class_id)
      DO UPDATE SET widget_config = $3, updated_at = NOW()
      RETURNING widget_config`,
      [userId, classId, JSON.stringify(stored)]
    );
    res.json(upsert.rows[0].widget_config);
  } catch (err) {
    console.error('[POST] Widget Settings error:', err);
    res.status(500).json({ error: 'Failed to save widget settings' });
  }
});

function parseDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeQuestionType(value) {
  return value === "mcq" || value === "long" ? value : "short";
}

async function ensureDiagnosticTablesExist(clientOrPool) {
  // Sessions opened by teachers. Only active sessions can be taken by students.
  // Avoid SERIAL here: it implicitly creates a sequence and can fail if the sequence
  // exists (e.g. partial migrations). We create/reuse sequences explicitly.
  await clientOrPool.query("CREATE SEQUENCE IF NOT EXISTS diagnostic_sessions_id_seq;");
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS diagnostic_sessions (
      id INTEGER PRIMARY KEY DEFAULT nextval('diagnostic_sessions_id_seq'),
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ends_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '45 minutes'),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_sessions_class_status_idx ON diagnostic_sessions(class_id, status);"
  );

  await clientOrPool.query("CREATE SEQUENCE IF NOT EXISTS diagnostic_attempts_id_seq;");
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS diagnostic_attempts (
      id INTEGER PRIMARY KEY DEFAULT nextval('diagnostic_attempts_id_seq'),
      session_id INTEGER NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','expired')),
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP,
      UNIQUE (session_id, student_id)
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_attempts_session_idx ON diagnostic_attempts(session_id);"
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_attempts_student_idx ON diagnostic_attempts(student_id);"
  );

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS diagnostic_answers (
      attempt_id INTEGER NOT NULL REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL,
      domain_key TEXT,
      selected_option TEXT,
      is_correct BOOLEAN,
      PRIMARY KEY (attempt_id, question_id)
    );`
  );
  // Safe migration for existing DBs.
  await clientOrPool.query(
    "ALTER TABLE diagnostic_answers ADD COLUMN IF NOT EXISTS domain_key TEXT;"
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_answers_attempt_idx ON diagnostic_answers(attempt_id);"
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_answers_domain_idx ON diagnostic_answers(domain_key);"
  );

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS diagnostic_domain_scores (
      attempt_id INTEGER NOT NULL REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
      domain_key TEXT NOT NULL,
      correct INTEGER NOT NULL,
      total INTEGER NOT NULL,
      percent INTEGER NOT NULL,
      PRIMARY KEY (attempt_id, domain_key)
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_domain_scores_attempt_idx ON diagnostic_domain_scores(attempt_id);"
  );

  // Optional: pin a stable baseline diagnostic attempt per student per class.
  // This is especially useful for demo flows where we want to let the student
  // take the diagnostic repeatedly without changing the baseline used on dashboards.
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS diagnostic_baselines (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attempt_id INTEGER NOT NULL REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (class_id, student_id)
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS diagnostic_baselines_attempt_idx ON diagnostic_baselines(attempt_id);"
  );
}

async function ensureAssignmentAnswerVisibilityExists(clientOrPool) {
  // Teachers control when students can see solutions.
  await clientOrPool.query(
    "ALTER TABLE assignments ADD COLUMN IF NOT EXISTS answers_visible BOOLEAN NOT NULL DEFAULT FALSE;"
  );

  // Teachers can choose between auto marking and manual marking.
  await clientOrPool.query(
    "ALTER TABLE assignments ADD COLUMN IF NOT EXISTS grading_mode VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (grading_mode IN ('auto','manual'));"
  );
}

async function ensureQuestionImageDataUrlExists(clientOrPool) {
  // Persist diagram previews (e.g. SVG data URLs) directly in Postgres.
  await clientOrPool.query(
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_data_url TEXT;"
  );
}

async function ensureQuestionSolutionTextExists(clientOrPool) {
  // Worked solution / steps (teacher-facing, optionally student-facing when answers_visible).
  await clientOrPool.query(
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS solution_text TEXT;"
  );
}

async function ensureAssignmentsQuestionTablesExist(client) {
  // Keep schema co-located with the endpoint for now. This mirrors backend/sql/assignments_schema.sql.
  await client.query(
    `CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('hw','cw')),
      title TEXT NOT NULL,
      description TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
      answers_visible BOOLEAN NOT NULL DEFAULT FALSE,
      grading_mode VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (grading_mode IN ('auto','manual')),
      due_at TIMESTAMP,
      scheduled_at TIMESTAMP,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );

  await client.query(
    `CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      prompt TEXT NOT NULL,
      question_type VARCHAR(20) NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','short','long')),
      correct_answer TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // Keep in sync with ensureQuestionImageDataUrlExists/ensureMathTaxonomyExists.
  // These ALTERs are safe if columns already exist.
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL;").catch(() => {});
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard'));"
  ).catch(() => {});
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('ai','manual'));"
  ).catch(() => {});
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;").catch(() => {});
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;").catch(() => {});
  await ensureQuestionImageDataUrlExists(client);
  await ensureQuestionSolutionTextExists(client);

  await client.query(
    `CREATE TABLE IF NOT EXISTS assignment_questions (
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      position INTEGER NOT NULL,
      points NUMERIC(8,2) NOT NULL DEFAULT 1,
      PRIMARY KEY (assignment_id, question_id)
    );`
  );

  await client.query(
    "CREATE INDEX IF NOT EXISTS assignment_questions_assignment_pos_idx ON assignment_questions(assignment_id, position);"
  );
}

async function ensureMathTaxonomyExists(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );`
  );
  await client.query("CREATE INDEX IF NOT EXISTS domains_subject_idx ON domains(subject_id);");

  await client.query(
    `CREATE TABLE IF NOT EXISTS topics (
      id SERIAL PRIMARY KEY,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (domain_id, key),
      UNIQUE (domain_id, name)
    );`
  );
  await client.query("CREATE INDEX IF NOT EXISTS topics_domain_idx ON topics(domain_id);");

  // Extend questions table (safe if already migrated)
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL;");
  await client.query(
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard'));"
  );
  await client.query(
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('ai','manual'));"
  );
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;");

  // Optional: persist generated diagram images (URL stored in DB)
  await client.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;");

  // Optional: persist SVG/PNG preview data URLs directly in Postgres.
  // This is useful when you don't want external object storage.
  await ensureQuestionImageDataUrlExists(client);

  await ensureQuestionSolutionTextExists(client);


  await client.query("CREATE INDEX IF NOT EXISTS questions_topic_idx ON questions(topic_id);");
  await client.query("CREATE INDEX IF NOT EXISTS questions_difficulty_idx ON questions(difficulty);");
  await client.query("CREATE INDEX IF NOT EXISTS questions_source_idx ON questions(source);");
  await client.query("CREATE INDEX IF NOT EXISTS questions_created_by_idx ON questions(created_by);");
}

async function seedMathTaxonomyIfEmpty(client) {
  const existing = await client.query("SELECT COUNT(*)::int AS n FROM domains");
  if ((existing.rows?.[0]?.n ?? 0) > 0) return;

  // Prefer Mathematics subject if present.
  const math = await client.query("SELECT id FROM subjects WHERE name ILIKE 'Mathematics' LIMIT 1");
  const subjectId = math.rows?.[0]?.id ?? null;

  const domains = [
    { key: 'number', name: 'Number' },
    { key: 'algebra', name: 'Algebra' },
    { key: 'measures', name: 'Measures' },
    { key: 'shape_space', name: 'Shape & Space' },
    { key: 'data_handling', name: 'Data Handling' },
  ];
  for (const d of domains) {
    await client.query(
      `INSERT INTO domains (subject_id, key, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [subjectId, d.key, d.name]
    );
  }

  const domainRows = await client.query("SELECT id, key FROM domains");
  const domainIdByKey = new Map(domainRows.rows.map((r) => [r.key, r.id]));
  const topics = [
    ['number', 'integers', 'Integers (Positive/Negative)'],
    ['number', 'fractions', 'Fractions'],
    ['number', 'decimals', 'Decimals'],
    ['number', 'percentages', 'Percentages'],
    ['number', 'ratio_rate', 'Ratio & Rate'],
    ['number', 'proportion', 'Direct Proportion'],

    ['algebra', 'expressions', 'Algebraic Expressions'],
    ['algebra', 'linear_equations', 'Linear Equations'],
    ['algebra', 'simultaneous', 'Simultaneous Equations'],
    ['algebra', 'quadratics', 'Quadratic Equations'],
    ['algebra', 'indices', 'Indices'],
    ['algebra', 'expansion_factorisation', 'Expansion & Factorisation'],
    ['algebra', 'inequalities', 'Linear Inequalities'],

    ['measures', 'units', 'Units & Conversion'],
    ['measures', 'perimeter_area', 'Perimeter & Area'],
    ['measures', 'volume', 'Volume'],
    ['measures', 'time', 'Time'],
    ['measures', 'speed_distance_time', 'Speed / Distance / Time'],

    ['shape_space', 'angles', 'Angles & Parallel Lines'],
    ['shape_space', 'triangles', 'Triangles & Quadrilaterals'],
    ['shape_space', 'circle', 'Circles'],
    ['shape_space', 'coordinates', 'Coordinates (2D)'],
    ['shape_space', 'transformations', 'Transformations'],

    ['data_handling', 'averages', 'Mean / Median / Mode'],
    ['data_handling', 'charts', 'Charts (Bar/Line/Pie)'],
    ['data_handling', 'probability', 'Probability'],
    ['data_handling', 'range', 'Range'],
  ];
  for (const [domainKey, key, name] of topics) {
    const domainId = domainIdByKey.get(domainKey);
    if (!domainId) continue;
    await client.query(
      `INSERT INTO topics (domain_id, key, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (domain_id, key) DO NOTHING`,
      [domainId, key, name]
    );
  }
}

async function ensureAssignmentSubmissionTablesExist(client) {
  // These tables exist in backend/sql/assignments_schema.sql in this repo.
  // Keeping a lightweight ensure here makes local dev more resilient.
  await client.query(
    `CREATE TABLE IF NOT EXISTS assignment_recipients (
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (assignment_id, student_id)
    );`
  );

  await client.query(
    "CREATE INDEX IF NOT EXISTS assignment_recipients_student_idx ON assignment_recipients(student_id);"
  );

  await client.query(
    `CREATE TABLE IF NOT EXISTS assignment_submissions (
      id SERIAL PRIMARY KEY,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started','in_progress','submitted','graded','missing')),
      started_at TIMESTAMP,
      submitted_at TIMESTAMP,
      graded_at TIMESTAMP,
      score NUMERIC(8,2),
      max_score NUMERIC(8,2),
      feedback TEXT,
      UNIQUE (assignment_id, student_id)
    );`
  );
  await client.query(
    `CREATE TABLE IF NOT EXISTS submission_answers (
      id SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      answer TEXT,
      is_correct BOOLEAN,
      points_awarded NUMERIC(8,2),
      response_time_ms INTEGER,
      answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (submission_id, question_id)
    );`
  );

  // Student works out steps here; we mark the final answer.
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS workings TEXT;"
  );

  // Teacher manual marking + AI assist can be stored here.
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS teacher_points_awarded NUMERIC(8,2);"
  );
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;"
  );
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS teacher_marked_at TIMESTAMP;"
  );
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS ai_mark_json JSONB;"
  );
  await client.query(
    "ALTER TABLE submission_answers ADD COLUMN IF NOT EXISTS ai_marked_at TIMESTAMP;"
  );
}

// Teacher control: auto vs manual marking
// Body: { gradingMode: 'auto' | 'manual' }
app.post('/api/assignments/:assignmentId/grading-mode', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  const gradingMode = String(req.body?.gradingMode || '').toLowerCase();
  if (gradingMode !== 'auto' && gradingMode !== 'manual') {
    return res.status(400).json({ error: "gradingMode must be 'auto' or 'manual'" });
  }
  try {
    await ensureAssignmentAnswerVisibilityExists(pool);
    const updated = await pool.query(
      `UPDATE assignments
       SET grading_mode = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, grading_mode`,
      [assignmentId, gradingMode]
    );
    if (!updated.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[POST] grading-mode error:', err);
    res.status(500).json({ error: 'Failed to update grading mode' });
  }
});

// Student: fetch assignment + questions + their saved answers (no correct answers returned)
app.get('/api/students/:studentId/assignments/:assignmentId', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const assignmentId = parseInt(req.params.assignmentId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });

  const client = await pool.connect();
  try {
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const aRes = await client.query(
      `SELECT a.id, a.class_id, a.type, a.title, a.description, a.due_at, a.status, a.grading_mode
       FROM assignments a
       WHERE a.id = $1`,
      [assignmentId]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    const assignment = aRes.rows[0];

    // Only published/closed assignments should be visible to students.
    if (String(assignment.status) === 'draft') return res.status(403).json({ error: 'Assignment is not published' });

    // Verify student is in the class
    const membership = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [assignment.class_id, studentId]
    );
    if (!membership.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    // If the assignment is published, ensure the student was snapshotted as a recipient.
    // This avoids the "enrolled but not assigned" edge case.
    if (String(assignment.status) === 'published') {
      const r = await client.query(
        `SELECT 1
         FROM assignment_recipients
         WHERE assignment_id = $1 AND student_id = $2
         LIMIT 1`,
        [assignmentId, studentId]
      );
      if (!r.rows.length) {
        await client.query(
          `INSERT INTO assignment_recipients (assignment_id, student_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [assignmentId, studentId]
        );
        await client.query(
          `INSERT INTO assignment_submissions (assignment_id, student_id, status)
           VALUES ($1, $2, 'not_started')
           ON CONFLICT (assignment_id, student_id) DO NOTHING`,
          [assignmentId, studentId]
        );
      }
    }

    const qRes = await client.query(
      `SELECT q.id, q.prompt, aq.position, aq.points
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       WHERE aq.assignment_id = $1
       ORDER BY aq.position ASC`,
      [assignmentId]
    );

    const subRes = await client.query(
      `SELECT id, status, started_at, submitted_at, graded_at, score, max_score, feedback
       FROM assignment_submissions
       WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, studentId]
    );
    const submission = subRes.rows[0] || null;

    let answers = [];
    if (submission) {
      const ansRes = await client.query(
        `SELECT question_id, answer, workings, is_correct, points_awarded,
                teacher_points_awarded, teacher_feedback, teacher_marked_at,
                ai_mark_json, ai_marked_at,
                answered_at
         FROM submission_answers
         WHERE submission_id = $1`,
        [submission.id]
      );
      answers = ansRes.rows || [];
    }

    res.json({ assignment, questions: qRes.rows, submission, answers });
  } catch (err) {
    console.error('[GET] Student assignment view error:', err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  } finally {
    client.release();
  }
});

// Student: save an answer for a question (workings + final answer)
app.post('/api/students/:studentId/assignments/:assignmentId/answer', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const assignmentId = parseInt(req.params.assignmentId);
  const questionId = parseInt(req.body?.questionId);
  const finalAnswer = req.body?.finalAnswer;
  const workings = req.body?.workings;
  const responseTimeMs = req.body?.responseTimeMs;

  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  if (!questionId) return res.status(400).json({ error: 'Missing or invalid questionId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const aRes = await client.query(
      `SELECT id, class_id, grading_mode
       FROM assignments
       WHERE id = $1`,
      [assignmentId]
    );
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const assignment = aRes.rows[0];

    // Verify student is in the class
    const membership = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [assignment.class_id, studentId]
    );
    if (!membership.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }

    // Ensure submission row exists
    const subIns = await client.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, status, started_at)
       VALUES ($1, $2, 'in_progress', NOW())
       ON CONFLICT (assignment_id, student_id) DO UPDATE
         SET status = CASE
           WHEN assignment_submissions.status IN ('submitted','graded') THEN assignment_submissions.status
           ELSE 'in_progress'
         END,
         started_at = COALESCE(assignment_submissions.started_at, NOW())
       RETURNING id, status`,
      [assignmentId, studentId]
    );
    const submissionId = subIns.rows[0].id;
    const submissionStatus = subIns.rows[0].status;

    // Don't allow edits after submission.
    if (submissionStatus === 'submitted' || submissionStatus === 'graded') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Assignment has already been submitted' });
    }

    // Fetch expected answer + points
    const qRes = await client.query(
      `SELECT q.correct_answer, aq.points
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       WHERE aq.assignment_id = $1 AND aq.question_id = $2`,
      [assignmentId, questionId]
    );
    if (!qRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Question not found on this assignment' });
    }
    const expected = qRes.rows[0].correct_answer;
    const points = Number(qRes.rows[0].points ?? 1);

    let isCorrect = null;
    let pointsAwarded = null;
    // Auto marking only runs when the teacher provided a non-empty expected answer.
    const expectedTrimmed = String(expected ?? '').trim();
    if (String(assignment.grading_mode) === 'auto' && expectedTrimmed) {
      isCorrect = answersEquivalent(String(finalAnswer ?? ''), expectedTrimmed);
      pointsAwarded = isCorrect ? points : 0;
    }

    await client.query(
      `INSERT INTO submission_answers
         (submission_id, question_id, answer, workings, is_correct, points_awarded, response_time_ms, answered_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (submission_id, question_id) DO UPDATE
          SET answer = EXCLUDED.answer,
              workings = EXCLUDED.workings,
              is_correct = EXCLUDED.is_correct,
              points_awarded = EXCLUDED.points_awarded,
              response_time_ms = EXCLUDED.response_time_ms,
              answered_at = NOW()`,
      [
        submissionId,
        questionId,
        finalAnswer !== undefined && finalAnswer !== null ? String(finalAnswer) : null,
        workings !== undefined && workings !== null ? String(workings) : null,
        isCorrect,
        pointsAwarded,
        responseTimeMs !== undefined && responseTimeMs !== null && !isNaN(+responseTimeMs) ? parseInt(responseTimeMs, 10) : null,
      ]
    );

    // Recompute score/max_score for this submission.
    const maxRes = await client.query(
      `SELECT COALESCE(SUM(points), 0)::float AS max_score
       FROM assignment_questions
       WHERE assignment_id = $1`,
      [assignmentId]
    );
    const scoreRes = await client.query(
      `SELECT COALESCE(SUM(points_awarded), 0)::float AS score
       FROM submission_answers
       WHERE submission_id = $1`,
      [submissionId]
    );
    await client.query(
      `UPDATE assignment_submissions
       SET max_score = $2, score = $3
       WHERE id = $1`,
      [submissionId, maxRes.rows[0].max_score, scoreRes.rows[0].score]
    );

    await client.query('COMMIT');
    res.json({ ok: true, isCorrect, pointsAwarded });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Student answer save error:', err);
    res.status(500).json({ error: 'Failed to save answer' });
  } finally {
    client.release();
  }
});

// Student: submit assignment (auto-saves all answers + locks status)
// Body: { answers: [{ questionId, finalAnswer, workings, responseTimeMs }...] }
app.post('/api/students/:studentId/assignments/:assignmentId/submit', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const assignmentId = parseInt(req.params.assignmentId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });

  const answersIn = req.body?.answers;
  if (!Array.isArray(answersIn) || answersIn.length === 0) {
    return res.status(400).json({ error: 'Missing answers' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const aRes = await client.query(
      `SELECT id, class_id, status, grading_mode
       FROM assignments
       WHERE id = $1`,
      [assignmentId]
    );
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const assignment = aRes.rows[0];
    if (String(assignment.status) === 'draft') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Assignment is not published' });
    }

    const membership = await client.query(
      `SELECT 1
       FROM class_memberships cm
       WHERE cm.class_id = $1 AND cm.user_id = $2 AND cm.membership_type = 'student'
       LIMIT 1`,
      [assignment.class_id, studentId]
    );
    if (!membership.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }

    // Ensure submission exists (and prevent re-submit)
    const subIns = await client.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, status, started_at)
       VALUES ($1, $2, 'in_progress', NOW())
       ON CONFLICT (assignment_id, student_id) DO UPDATE
         SET started_at = COALESCE(assignment_submissions.started_at, NOW())
       RETURNING id, status`,
      [assignmentId, studentId]
    );
    const submissionId = subIns.rows[0].id;
    const submissionStatus = subIns.rows[0].status;
    if (submissionStatus === 'submitted' || submissionStatus === 'graded') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Assignment has already been submitted' });
    }

    // Fetch all questions on this assignment (including marking data)
    const qRes = await client.query(
      `SELECT aq.question_id, aq.points, q.correct_answer
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       WHERE aq.assignment_id = $1
       ORDER BY aq.position ASC`,
      [assignmentId]
    );
    const questionRows = qRes.rows || [];
    if (questionRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Assignment has no questions' });
    }

    // Require an answer for every question (no blank submissions)
    const answerByQ = new Map();
    for (const a of answersIn) {
      const qid = a?.questionId;
      if (qid === undefined || qid === null || isNaN(+qid)) continue;
      answerByQ.set(String(parseInt(qid, 10)), a);
    }

    for (const q of questionRows) {
      const a = answerByQ.get(String(q.question_id));
      const finalAnswer = a?.finalAnswer;
      if (!String(finalAnswer || '').trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'All questions must be answered before submitting' });
      }
    }

    // Save answers (and auto-mark if configured)
    for (const q of questionRows) {
      const qid = String(q.question_id);
      const a = answerByQ.get(qid) || {};
      const finalAnswer = String(a?.finalAnswer ?? '');
      const workings = a?.workings !== undefined && a?.workings !== null ? String(a.workings) : null;
      const responseTimeMs = a?.responseTimeMs;

      const expected = q.correct_answer;
      const points = Number(q.points ?? 1);
      let isCorrect = null;
      let pointsAwarded = null;
      if (String(assignment.grading_mode) === 'auto' && expected !== null && expected !== undefined) {
        isCorrect = answersEquivalent(String(finalAnswer ?? ''), String(expected ?? ''));
        pointsAwarded = isCorrect ? points : 0;
      }

      await client.query(
        `INSERT INTO submission_answers
           (submission_id, question_id, answer, workings, is_correct, points_awarded, response_time_ms, answered_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (submission_id, question_id) DO UPDATE
            SET answer = EXCLUDED.answer,
                workings = EXCLUDED.workings,
                is_correct = EXCLUDED.is_correct,
                points_awarded = EXCLUDED.points_awarded,
                response_time_ms = EXCLUDED.response_time_ms,
                answered_at = NOW()`,
        [
          submissionId,
          parseInt(qid, 10),
          finalAnswer !== undefined && finalAnswer !== null ? String(finalAnswer) : null,
          workings,
          isCorrect,
          pointsAwarded,
          responseTimeMs !== undefined && responseTimeMs !== null && !isNaN(+responseTimeMs) ? parseInt(responseTimeMs, 10) : null,
        ]
      );
    }

    // Recompute max_score + score.
    const maxRes = await client.query(
      `SELECT COALESCE(SUM(points), 0)::float AS max_score
       FROM assignment_questions
       WHERE assignment_id = $1`,
      [assignmentId]
    );
    const maxScore = maxRes.rows?.[0]?.max_score ?? 0;

    let score = null;
    if (String(assignment.grading_mode) === 'auto') {
      const scoreRes = await client.query(
        `SELECT COALESCE(SUM(points_awarded), 0)::float AS score
         FROM submission_answers
         WHERE submission_id = $1`,
        [submissionId]
      );
      score = scoreRes.rows?.[0]?.score ?? 0;
    }

    const updated = await client.query(
      `UPDATE assignment_submissions
       SET status = 'submitted', submitted_at = NOW(), max_score = $2, score = $3
       WHERE id = $1
       RETURNING id, status, submitted_at, score, max_score`,
      [submissionId, maxScore, score]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, submission: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Student submit assignment error:', err);
    return res.status(500).json({ error: 'Failed to submit assignment' });
  } finally {
    client.release();
  }
});

async function ensureAssignmentRecipientsAndSubmissions(client, assignmentId, classId) {
  // Snapshot current class roster and create submission rows
  await client.query(
    `INSERT INTO assignment_recipients (assignment_id, student_id)
     SELECT $1, cm.user_id
     FROM class_memberships cm
     WHERE cm.class_id = $2 AND cm.membership_type = 'student'
     ON CONFLICT DO NOTHING`,
    [assignmentId, classId]
  );

  await client.query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, status)
     SELECT $1, r.student_id, 'not_started'
     FROM assignment_recipients r
     WHERE r.assignment_id = $1
     ON CONFLICT (assignment_id, student_id) DO NOTHING`,
    [assignmentId]
  );
}

async function ensureRiskTablesExist(clientOrPool) {
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS class_thresholds (
      class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
      high_risk_threshold INTEGER NOT NULL DEFAULT 50,
      mastery_threshold INTEGER NOT NULL DEFAULT 70,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS class_thresholds_updated_by_idx ON class_thresholds(updated_by);"
  );

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS risk_overrides (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope VARCHAR(10) NOT NULL CHECK (scope IN ('overall','domain')),
      domain_key TEXT,
      system_label VARCHAR(20) NOT NULL,
      override_label VARCHAR(20) NOT NULL CHECK (override_label IN ('high_risk','developing','mastery')),
      reason TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS risk_overrides_class_student_idx ON risk_overrides(class_id, student_id);"
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS risk_overrides_class_student_scope_idx ON risk_overrides(class_id, student_id, scope);"
  );
  await clientOrPool.query(
    "CREATE INDEX IF NOT EXISTS risk_overrides_created_at_idx ON risk_overrides(created_at);"
  );
}

async function ensurePracticeTablesExist(clientOrPool) {
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS practice_sets (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain_key TEXT NOT NULL,
      topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      difficulty VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
      source VARCHAR(10) NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','curated')),
      answers_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_sets_class_student_idx ON practice_sets(class_id, student_id);");
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_sets_created_at_idx ON practice_sets(created_at);");

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS practice_set_questions (
      practice_set_id INTEGER NOT NULL REFERENCES practice_sets(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      position INTEGER NOT NULL,
      points NUMERIC(8,2) NOT NULL DEFAULT 1,
      PRIMARY KEY (practice_set_id, question_id)
    );`
  );
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_set_questions_set_pos_idx ON practice_set_questions(practice_set_id, position);");

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS practice_attempts (
      id SERIAL PRIMARY KEY,
      practice_set_id INTEGER NOT NULL REFERENCES practice_sets(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP,
      score NUMERIC(8,2),
      max_score NUMERIC(8,2),
      UNIQUE (practice_set_id, student_id)
    );`
  );
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_attempts_student_idx ON practice_attempts(student_id);");
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_attempts_set_idx ON practice_attempts(practice_set_id);");

  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS practice_answers (
      attempt_id INTEGER NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
      answer TEXT,
      workings TEXT,
      is_correct BOOLEAN,
      points_awarded NUMERIC(8,2),
      response_time_ms INTEGER,
      answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (attempt_id, question_id)
    );`
  );
  await clientOrPool.query("CREATE INDEX IF NOT EXISTS practice_answers_attempt_idx ON practice_answers(attempt_id);");
}

function normalizePracticeGeneratedQuestion(q) {
  // Accept multiple shapes from n8n.
  const prompt = String(q?.question ?? q?.prompt ?? '').trim();
  const steps = Array.isArray(q?.steps) ? q.steps.map((x) => String(x ?? '').trim()).filter(Boolean) : [];

  const explicitFinal = String(q?.final_answer ?? q?.finalAnswer ?? '').trim();
  const solutionBase = String(q?.solution ?? q?.answer ?? q?.correct_answer ?? q?.correctAnswer ?? '').trim();
  const solutionLooksLikeFinal = Boolean(steps.length) && Boolean(solutionBase) && !solutionBase.includes('\n');
  const finalAnswer = (explicitFinal || (solutionLooksLikeFinal ? solutionBase : ''));

  const solutionTextParts = [];
  if (steps.length) {
    solutionTextParts.push(steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n'));
  }
  if (finalAnswer) solutionTextParts.push(`Final answer: ${finalAnswer}`);
  if (!steps.length && solutionBase) solutionTextParts.push(solutionBase);
  const solutionText = solutionTextParts.join('\n\n').trim();

  const difficultyRaw = String(q?.difficulty || '').toLowerCase();
  const difficulty = difficultyRaw === 'easy' || difficultyRaw === 'hard' ? difficultyRaw : 'medium';
  const imageDataUrl = q?.imageDataUrl ?? q?.image_data_url;
  const imageUrl = q?.imageUrl ?? q?.image_url;

  return {
    prompt,
    finalAnswer: finalAnswer || null,
    solutionText: solutionText || null,
    difficulty,
    imageDataUrl: imageDataUrl ? String(imageDataUrl) : null,
    imageUrl: imageUrl ? String(imageUrl) : null,
  };
}

function clampInt(v, min, max, fallback) {
  const n = v !== undefined && v !== null && !isNaN(+v) ? parseInt(String(v), 10) : null;
  if (n === null || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function computeRiskLabel(percent, { highRisk, mastery }) {
  if (percent === null || percent === undefined || !Number.isFinite(+percent)) return 'insufficient_data';
  const p = Number(percent);
  if (p < highRisk) return 'high_risk';
  if (p >= mastery) return 'mastery';
  return 'developing';
}

function worstLabel(labels) {
  // severity order: high_risk > developing > mastery > insufficient_data
  let best = 'insufficient_data';
  for (const l of labels) {
    if (l === 'high_risk') return 'high_risk';
    if (l === 'developing') best = best === 'mastery' ? 'developing' : best === 'insufficient_data' ? 'developing' : best;
    if (l === 'mastery' && best === 'insufficient_data') best = 'mastery';
  }
  return best;
}

function riskLabelToUi(label) {
  if (label === 'high_risk') return 'High Risk';
  if (label === 'mastery') return 'Mastery';
  if (label === 'developing') return 'Developing';
  return 'Insufficient Data';
}

// Create assignment (draft or published)
app.post('/api/assignments', async (req, res) => {
  const {
    classId,
    subjectId,
    type,
    title,
    description,
    dueAt,
    scheduledAt,
    status,
    gradingMode,
    createdBy,
  } = req.body || {};

  const parsedClassId = parseInt(classId);
  const parsedSubjectId = subjectId ? parseInt(subjectId) : null;
  const parsedCreatedBy = parseInt(createdBy);
  const normalizedType = type === 'cw' ? 'cw' : 'hw';
  const normalizedStatus = status === 'published' ? 'published' : 'draft';
  const normalizedGradingMode = String(gradingMode || '').toLowerCase() === 'manual' ? 'manual' : 'auto';
  const due = parseDateOrNull(dueAt);
  const scheduled = parseDateOrNull(scheduledAt);

  if (!parsedClassId || !parsedCreatedBy || !title) {
    return res.status(400).json({ error: 'Missing classId, createdBy, or title' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentAnswerVisibilityExists(client);
    const inserted = await client.query(
      `INSERT INTO assignments
        (class_id, subject_id, type, title, description, status, grading_mode, due_at, scheduled_at, created_by, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        parsedClassId,
        parsedSubjectId,
        normalizedType,
        title,
        description || null,
        normalizedStatus,
        normalizedGradingMode,
        due,
        scheduled,
        parsedCreatedBy,
      ]
    );

    const assignment = inserted.rows[0];
    if (assignment.status === 'published') {
      await ensureAssignmentRecipientsAndSubmissions(client, assignment.id, assignment.class_id);
    }
    await client.query('COMMIT');
    res.json(assignment);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Create assignment error:', err);
    res.status(500).json({ error: 'Failed to create assignment' });
  } finally {
    client.release();
  }
});

// Publish assignment (creates recipients/submissions snapshot)
app.post('/api/assignments/:assignmentId/publish', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentAnswerVisibilityExists(client);
    const updated = await client.query(
      `UPDATE assignments
       SET status = 'published', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignmentId]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const assignment = updated.rows[0];
    await ensureAssignmentRecipientsAndSubmissions(client, assignment.id, assignment.class_id);
    await client.query('COMMIT');
    res.json(assignment);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Publish assignment error:', err);
    res.status(500).json({ error: 'Failed to publish assignment' });
  } finally {
    client.release();
  }
});

// Rename an assignment (title only)
// Body: { teacherId, title }
app.post('/api/assignments/:assignmentId/rename', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  const teacherId = req.body?.teacherId !== undefined && req.body?.teacherId !== null
    ? parseInt(String(req.body.teacherId), 10)
    : null;
  const nextTitle = String(req.body?.title || '').trim();

  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });
  if (!nextTitle) return res.status(400).json({ error: 'Missing title' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureCoreTablesExist(client);
    await ensureAssignmentAnswerVisibilityExists(client);

    const teacherRes = await client.query(
      `SELECT id, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [teacherId]
    );
    const teacher = teacherRes.rows?.[0] || null;
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Teacher not found' });
    }
    if (String(teacher.role || '').toLowerCase() !== 'teacher') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'User is not a teacher' });
    }

    const aRes = await client.query(
      `SELECT id, created_by
       FROM assignments
       WHERE id = $1
       LIMIT 1`,
      [assignmentId]
    );
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const a = aRes.rows[0];
    if (Number(a.created_by) !== Number(teacherId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed to rename this assignment' });
    }

    const updated = await client.query(
      `UPDATE assignments
       SET title = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, updated_at`,
      [assignmentId, nextTitle]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, assignment: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Rename assignment error:', err);
    return res.status(500).json({ error: 'Failed to rename assignment' });
  } finally {
    client.release();
  }
});

// Teacher control: allow/hide answers for students
// Body: { answersVisible: true|false }
app.post('/api/assignments/:assignmentId/answers-visible', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });

  const answersVisible = req.body?.answersVisible;
  if (typeof answersVisible !== 'boolean') {
    return res.status(400).json({ error: 'answersVisible must be a boolean' });
  }

  const client = await pool.connect();
  try {
    await ensureAssignmentAnswerVisibilityExists(client);
    const updated = await client.query(
      `UPDATE assignments
       SET answers_visible = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [assignmentId, answersVisible]
    );
    if (!updated.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[POST] Answers visible toggle error:', err);
    res.status(500).json({ error: 'Failed to update answers visibility' });
  } finally {
    client.release();
  }
});

// Attach questions to an assignment
// Body: { questions: [{ prompt, questionType, correctAnswer, points, position }] }
app.post('/api/assignments/:assignmentId/questions', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });

  const questions = req.body?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Missing questions' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await ensureQuestionImageDataUrlExists(client);
    await seedMathTaxonomyIfEmpty(client);

    // Ensure assignment exists
    const aRes = await client.query('SELECT id, class_id FROM assignments WHERE id = $1', [assignmentId]);
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Replace existing mapping
    await client.query('DELETE FROM assignment_questions WHERE assignment_id = $1', [assignmentId]);

    const insertedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i] || {};
      const prompt = (q.prompt || '').toString().trim();
      if (!prompt) continue;

      const questionType = normalizeQuestionType(q.questionType);
      const correctAnswer = q.correctAnswer !== undefined && q.correctAnswer !== null ? String(q.correctAnswer) : null;
      const solutionText = q.solutionText !== undefined && q.solutionText !== null ? String(q.solutionText) : null;
      const points = q.points !== undefined && q.points !== null && !isNaN(+q.points) ? Number(q.points) : 1;
      const position = q.position !== undefined && q.position !== null && !isNaN(+q.position) ? parseInt(q.position) : (i + 1);


      const difficulty = (q.difficulty || 'medium').toString();
      const normalizedDifficulty = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium';
      const source = (q.source || 'manual').toString() === 'ai' ? 'ai' : 'manual';
      const createdBy = q.createdBy !== undefined && q.createdBy !== null && !isNaN(+q.createdBy) ? parseInt(q.createdBy) : null;

      // Image persistence:
      // - imageUrl: stable URL (optional)
      // - imageDataUrl: data URL (SVG base64) for local Postgres persistence
      const imageUrl = q.imageUrl !== undefined && q.imageUrl !== null ? String(q.imageUrl) : null;
      const imageDataUrl = q.imageDataUrl !== undefined && q.imageDataUrl !== null ? String(q.imageDataUrl) : null;

      // Map domain/topic keys from frontend into normalized topic_id
      let topicId = null;
      const domainKey = q.domainId ? String(q.domainId) : null;
      const topicKey = q.topicId ? String(q.topicId) : null;
      if (domainKey && topicKey) {
        const tRes = await client.query(
          `SELECT t.id
           FROM topics t
           JOIN domains d ON d.id = t.domain_id
           WHERE d.key = $1 AND t.key = $2
           LIMIT 1`,
          [domainKey, topicKey]
        );
        topicId = tRes.rows?.[0]?.id ?? null;
      }

      const qRes = await client.query(
        `INSERT INTO questions (topic_id, prompt, question_type, correct_answer, solution_text, image_url, image_data_url, difficulty, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, topic_id, prompt, question_type, correct_answer, solution_text, image_url, image_data_url, difficulty, source, created_by`,
        [topicId, prompt, questionType, correctAnswer, solutionText, imageUrl, imageDataUrl, normalizedDifficulty, source, createdBy]
      );
      const newQ = qRes.rows[0];
      insertedQuestions.push(newQ);

      await client.query(
        `INSERT INTO assignment_questions (assignment_id, question_id, position, points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [assignmentId, newQ.id, position, points]
      );
    }

    await client.query('COMMIT');
    res.json({ assignmentId, questions: insertedQuestions });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Assignment questions error:', err);
    res.status(500).json({ error: 'Failed to save assignment questions' });
  } finally {
    client.release();
  }
});

// Proxy AI generation to n8n (RAG/LLM layer)
// Body: { title, topic, grade, prompt?, questionSpecs: [{ difficulty, questionType }, ...] }
app.post('/api/ai/generate-questions', async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL is not configured on the backend' });
  }

  const { title, topic, grade, prompt, questionSpecs, assignmentId, domainKey, topicKey, imageMode } = req.body || {};
  if (!title || !topic || !Array.isArray(questionSpecs) || questionSpecs.length === 0) {
    return res.status(400).json({ error: 'Missing title, topic, or questionSpecs' });
  }

  const normalizedGrade = grade !== undefined && grade !== null && !isNaN(+grade) ? Number(grade) : 8;

  // Build a prompt-like structure but keep it simple for n8n.
  const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const n8nPayload = {
    title,
    topic,
    domain_key: domainKey ? String(domainKey) : "",
    topic_key: topicKey ? String(topicKey) : "",
    image_mode: imageMode === "diagram" ? "diagram" : "none",
    grade: normalizedGrade,
    prompt: prompt ? String(prompt) : "",
    num_questions: questionSpecs.length,
    question_specs: questionSpecs.map((s, idx) => ({
      index: idx + 1,
      difficulty: (s?.difficulty || 'medium').toString(),
      question_type: normalizeQuestionType(s?.questionType),
    })),
    request_id: requestId,
  };

  // Optional: if the caller is generating for a specific assignment, n8n can attach images
  // and we can persist them into Supabase Storage and return stable URLs.
  if (assignmentId !== undefined && assignmentId !== null && !isNaN(+assignmentId)) {
    n8nPayload.assignment_id = parseInt(assignmentId);
  }

  try {
    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[POST] n8n error:', resp.status, text);
      return res.status(502).json({ error: 'n8n generation failed' });
    }

    // n8n can respond with empty body when misconfigured (e.g. webhook not using Respond node).
    const rawText = await resp.text().catch(() => '');
    if (!rawText || !rawText.trim()) {
      console.error('[POST] n8n empty response body');
      return res.status(502).json({ error: 'n8n returned empty response' });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      console.error('[POST] n8n invalid JSON:', rawText.slice(0, 500));
      return res.status(502).json({ error: 'n8n returned invalid JSON' });
    }

    // Enforce image policy: only allow diagrams when explicitly requested.
    if (n8nPayload.image_mode !== 'diagram' && Array.isArray(data?.questions)) {
      data.questions = data.questions.map((q) => {
        if (!q || typeof q !== 'object') return q;
        const next = { ...q };
        delete next.imageDataUrl;
        delete next.image_data_url;
        delete next.imageUrl;
        delete next.image_url;
        return next;
      });
    }

    // Supabase image upload removed. If n8n returns imageDataUrl/imageUrl,
    // the frontend can still use it as-is.

    return res.json(data);
  } catch (err) {
    console.error('[POST] n8n fetch error:', err);
    return res.status(502).json({ error: 'Failed to connect to n8n' });
  }
});

// List assignments for a class (with counts)
app.get('/api/classes/:classId/assignments', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const type = req.query.type;
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  try {
    await ensureAssignmentAnswerVisibilityExists(pool);
    await ensureAssignmentSubmissionTablesExist(pool);
    await ensureAssignmentsQuestionTablesExist(pool);
    const params = [classId];
    let where = 'a.class_id = $1';
    if (type === 'hw' || type === 'cw') {
      params.push(type);
      where += ' AND a.type = $2';
    }
    const result = await pool.query(
      `SELECT
          a.*, 
          COALESCE(r.assigned_count, 0)::int AS assigned_count,
          COALESCE(s.completed_count, 0)::int AS completed_count,
          COALESCE(q.question_count, 0)::int AS question_count
        FROM assignments a
        LEFT JOIN (
          SELECT assignment_id, COUNT(DISTINCT student_id)::int AS assigned_count
          FROM assignment_recipients
          GROUP BY assignment_id
        ) r ON r.assignment_id = a.id
        LEFT JOIN (
          SELECT assignment_id, COUNT(*) FILTER (WHERE status IN ('submitted','graded'))::int AS completed_count
          FROM assignment_submissions
          GROUP BY assignment_id
        ) s ON s.assignment_id = a.id
        LEFT JOIN (
          SELECT assignment_id, COUNT(*)::int AS question_count
          FROM assignment_questions
          GROUP BY assignment_id
        ) q ON q.assignment_id = a.id
        WHERE ${where}
        ORDER BY a.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET] Class assignments error:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Delete an assignment
// Note: this deletes the assignment row; related recipients/submissions/mappings cascade.
app.delete('/api/assignments/:assignmentId', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Demo safety: prevent deletion of demo assignments.
    // We intentionally keep these around so the hosted demo remains stable.
    const aRes = await client.query(
      `SELECT id, title
       FROM assignments
       WHERE id = $1
       LIMIT 1`,
      [assignmentId]
    );
    const a = aRes.rows?.[0] || null;
    if (!a) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (String(a.title || '').toLowerCase().includes('demo')) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This cannot be deleted — it is for demo.' });
    }

    const del = await client.query(
      `DELETE FROM assignments
       WHERE id = $1
       RETURNING *`,
      [assignmentId]
    );
    if (!del.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Assignment not found' });
    }
    await client.query('COMMIT');
    return res.json({ ok: true, assignment: del.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DELETE] Assignment error:', err);
    return res.status(500).json({ error: 'Failed to delete assignment' });
  } finally {
    client.release();
  }
});

// Helper: assign the teacher to all classes.
// Inserts missing class_memberships rows (membership_type='teacher').
// Dev-only: disabled automatically if NODE_ENV=production.
app.post('/api/assign-teacher-all-classes', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production' });
  }

  const teacherEmailIn = req.body?.teacherEmail;
  const teacherEmail = teacherEmailIn ? String(teacherEmailIn).trim() : 'teacher@demo.com';
  const teacherIdIn = req.body?.teacherId;
  const teacherIdParsed = teacherIdIn !== undefined && teacherIdIn !== null && String(teacherIdIn).trim() !== ''
    ? parseInt(String(teacherIdIn), 10)
    : null;

  try {
    let teacher = null;
    if (teacherIdParsed) {
      const t = await pool.query(
        `SELECT id, name, email, role
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [teacherIdParsed]
      );
      teacher = t.rows?.[0] || null;
    } else {
      const t = await pool.query(
        `SELECT id, name, email, role
         FROM users
         WHERE email = $1
         LIMIT 1`,
        [teacherEmail]
      );
      teacher = t.rows?.[0] || null;
    }

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found', teacherEmail, teacherId: teacherIdParsed });
    }

    if (String(teacher.role || '').toLowerCase() !== 'teacher') {
      // Keep this strict to avoid accidentally granting class access to a student account.
      return res.status(400).json({ error: 'User is not a teacher', user: teacher });
    }

    // Avoid relying on a unique constraint by using WHERE NOT EXISTS.
    const ins = await pool.query(
      `INSERT INTO class_memberships (class_id, user_id, membership_type)
       SELECT c.id, $1::int, 'teacher'
       FROM classes c
       WHERE NOT EXISTS (
         SELECT 1
         FROM class_memberships cm
         WHERE cm.class_id = c.id
           AND cm.user_id = $1::int
           AND cm.membership_type = 'teacher'
       )
       RETURNING class_id`,
      [teacher.id]
    );

    const assignedToClassIds = (ins.rows || []).map((r) => r.class_id).filter(Boolean);
    return res.json({
      ok: true,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      insertedCount: assignedToClassIds.length,
      assignedToClassIds,
    });
  } catch (err) {
    console.error('[POST] Assign teacher all classes error:', err);
    return res.status(500).json({ error: 'Failed to assign teacher to classes' });
  }
});

// Helper: seed at least 1 CW assignment per class for a teacher.
// This is useful for the Live Session UI to show dropdowns.
// Dev-only: disabled automatically if NODE_ENV=production.
app.post('/api/seed-cw', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production' });
  }

  const teacherIdIn = req.body?.teacherId;
  const teacherId = teacherIdIn !== undefined && teacherIdIn !== null ? parseInt(String(teacherIdIn), 10) : 1;
  const classIdIn = req.body?.classId;
  const classId = classIdIn !== undefined && classIdIn !== null && String(classIdIn).trim() !== ''
    ? parseInt(String(classIdIn), 10)
    : null;

  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });
  if (classIdIn !== undefined && classId === null) return res.status(400).json({ error: 'Missing or invalid classId' });

  try {
    const classesRes = classId
      ? await pool.query(
          `SELECT c.id, c.name
           FROM classes c
           JOIN class_memberships cm
             ON cm.class_id = c.id
            AND cm.user_id = $1
            AND cm.membership_type = 'teacher'
           WHERE c.id = $2`,
          [teacherId, classId]
        )
      : await pool.query(
          `SELECT c.id, c.name
           FROM classes c
           JOIN class_memberships cm
             ON cm.class_id = c.id
            AND cm.user_id = $1
            AND cm.membership_type = 'teacher'
           ORDER BY c.id`,
          [teacherId]
        );

    const teacherClasses = classesRes.rows || [];
    if (teacherClasses.length === 0) {
      return res.json({ ok: true, seeded: [], message: 'No classes found for teacher' });
    }

    const seeded = [];
    for (const c of teacherClasses) {
      const existing = await pool.query(
        `SELECT id, title
         FROM assignments
         WHERE class_id = $1 AND type = 'cw'
         ORDER BY created_at DESC
         LIMIT 1`,
        [c.id]
      );

      let assignmentId;
      let title;
      let created = false;

      if (existing.rows?.length) {
        assignmentId = existing.rows[0].id;
        title = existing.rows[0].title;
      } else {
        created = true;
        title = `Classwork - ${c.name}`;
        const description = 'Auto-created for local development.';
        const ins = await pool.query(
          `INSERT INTO assignments (class_id, type, title, description, status, created_by, scheduled_at)
           VALUES ($1, 'cw', $2, $3, 'published', $4, NOW())
           RETURNING id, title`,
          [c.id, title, description, teacherId]
        );
        assignmentId = ins.rows[0].id;
      }

      // Ensure the CW has at least 3 questions attached.
      const existingQ = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM assignment_questions
         WHERE assignment_id = $1`,
        [assignmentId]
      );
      const qCount = existingQ.rows?.[0]?.count ?? 0;

      if (qCount < 1) {
        const qIns = await pool.query(
          `INSERT INTO questions (topic_id, prompt, question_type, correct_answer, difficulty, source, created_by)
           VALUES
             (NULL, '(x + 2)(x + 5)', 'short', 'x^2 + 7x + 10', 'easy', 'manual', $1),
             (NULL, '(2x + 3)(x + 4)', 'short', '2x^2 + 11x + 12', 'easy', 'manual', $1),
             (NULL, '(x - 1)(x + 7)', 'short', 'x^2 + 6x - 7', 'easy', 'manual', $1)
           RETURNING id`,
          [teacherId]
        );
        const ids = (qIns.rows || []).map((r) => r.id);
        for (let i = 0; i < ids.length; i++) {
          await pool.query(
            `INSERT INTO assignment_questions (assignment_id, question_id, position, points)
             VALUES ($1, $2, $3, 1)
             ON CONFLICT DO NOTHING`,
            [assignmentId, ids[i], i + 1]
          );
        }
      }

      seeded.push({ classId: c.id, className: c.name, assignmentId, title, created });
    }

    return res.json({ ok: true, seeded });
  } catch (err) {
    console.error('[POST] Seed CW error:', err);
    return res.status(500).json({ error: 'Failed to seed CW assignments' });
  }
});

// Helper: generate a realistic in-memory live session report.
// This populates /api/realtime/reports for UI testing without running a real session.
// Body: { teacherId?, classId?, assignmentId? }
app.post('/api/create-live-report', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production' });
  }

  const teacherIdIn = req.body?.teacherId;
  const teacherId = teacherIdIn !== undefined && teacherIdIn !== null ? parseInt(String(teacherIdIn), 10) : 1;
  const classIdIn = req.body?.classId;
  const classId = classIdIn !== undefined && classIdIn !== null ? parseInt(String(classIdIn), 10) : 1;
  let assignmentIdIn = req.body?.assignmentId;
  const assignmentId = assignmentIdIn !== undefined && assignmentIdIn !== null && String(assignmentIdIn).trim() !== ''
    ? parseInt(String(assignmentIdIn), 10)
    : null;

  if (!teacherId || !classId) return res.status(400).json({ error: 'Invalid teacherId or classId' });

  const reportName = req.body?.name ? String(req.body.name).trim() : 'First report';

  try {
    // Ensure CW exists (and has questions).
    await pool.query('SELECT 1');
    // Reuse existing seed logic by calling internal handler via HTTP is overkill; do a minimal check.
    let cw = null;
    if (assignmentId) {
      const aRes = await pool.query('SELECT id, class_id, type FROM assignments WHERE id = $1', [assignmentId]);
      if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });
      cw = aRes.rows[0];
    } else {
      const cwRes = await pool.query(
        `SELECT id, class_id, type
         FROM assignments
         WHERE class_id = $1 AND type = 'cw'
         ORDER BY created_at DESC
         LIMIT 1`,
        [classId]
      );
      cw = cwRes.rows?.[0] || null;
    }

    if (!cw) {
      // If no CW exists, ask the seed endpoint logic to create one.
      // eslint-disable-next-line global-require
      const { sessions: _ignore } = require('./realtime/sessionsStore');
      // Use the existing /api/seed-cw by invoking the same DB operations would duplicate code;
      // simplest is to create a CW row and attach 3 questions (same as seed-cw).
      const title = `Classwork - Class ${classId}`;
      const ins = await pool.query(
        `INSERT INTO assignments (class_id, type, title, description, status, created_by, scheduled_at)
         VALUES ($1, 'cw', $2, 'Auto-created for local development', 'published', $3, NOW())
         RETURNING id`,
        [classId, title, teacherId]
      );
      cw = { id: ins.rows[0].id, class_id: classId, type: 'cw' };
    }

    const assignmentIdFinal = cw.id;
    const aDetail = await pool.query('SELECT id, title FROM assignments WHERE id = $1', [assignmentIdFinal]);
    const assignmentTitle = aDetail.rows?.[0]?.title || `Assignment ${assignmentIdFinal}`;

    const qRes = await pool.query(
      `SELECT q.id, q.prompt, q.correct_answer, aq.position
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       WHERE aq.assignment_id = $1
       ORDER BY aq.position ASC`,
      [assignmentIdFinal]
    );
    const rows = qRes.rows || [];
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Assignment has no questions. Use /api/seed-cw first.' });
      }

    const questions = rows.map((r) => ({ id: String(r.id), text: r.prompt }));
    const correctAnswers = Object.create(null);
    for (const r of rows) {
      if (r.correct_answer !== null && r.correct_answer !== undefined) {
        correctAnswers[String(r.id)] = String(r.correct_answer);
      }
    }

    // eslint-disable-next-line global-require
    const { createSession, endSession, deleteSession, nowMs } = require('./realtime/sessionsStore');
    // eslint-disable-next-line global-require
    const { ensureStudent, addRaisedHand, ensureQuestionStats } = require('./realtime/sessionRules');
    // eslint-disable-next-line global-require
    const { buildSessionReport } = require('./realtime/sessionReport');
    // eslint-disable-next-line global-require
    const { saveReport } = require('./realtime/reportsStore');
    // eslint-disable-next-line global-require
    const reportsDb = require('./realtime/reportsDb');

    const sessionId = `report_${Date.now()}`;
    const session = createSession({ classId, assignmentId: assignmentIdFinal, teacherId, sessionId });
    session.assignmentTitle = assignmentTitle;
    session.questions = questions;
    session.correctAnswers = correctAnswers;

    function recordAttempt({ studentId, questionId, isCorrect }) {
      const student = ensureStudent(session, studentId);
      student.name = student.name || `Student ${studentId}`;

      const qid = String(questionId);
      const pq = student.perQuestion[qid] || { questionId: qid, attempts: 0, correct: 0, wrong: 0 };
      pq.attempts += 1;
      if (isCorrect) pq.correct += 1;
      else pq.wrong += 1;
      student.perQuestion[qid] = pq;

      const qs = ensureQuestionStats(session.questionStats, qid);
      qs.attempts += 1;
      if (isCorrect) qs.correct += 1;
      else qs.wrong += 1;
    }

    const q1 = questions[0].id;
    const q2 = questions[1]?.id || q1;

    // Create a small roster
    const roster = ['s1', 's2', 's3', 's4', 's5', 's6'].map((x) => `demo_${x}`);
    for (const sid of roster) {
      const st = ensureStudent(session, sid);
      st.name = sid;
    }

    // Raised hands and difficult marks
    addRaisedHand(session, 'demo_s1', q1, new Date().toISOString());
    addRaisedHand(session, 'demo_s2', q1, new Date().toISOString());

    session.difficultMarks[String(q2)] = Object.create(null);
    session.difficultMarks[String(q2)]['demo_s3'] = true;
    session.difficultMarks[String(q2)]['demo_s4'] = true;

    // Struggling: 3 students with >=2 wrong on same question
    for (const sid of ['demo_s1', 'demo_s2', 'demo_s3']) {
      recordAttempt({ studentId: sid, questionId: q1, isCorrect: false });
      recordAttempt({ studentId: sid, questionId: q1, isCorrect: false });
    }

    // Low accuracy: at least 5 attempts with <50%
    recordAttempt({ studentId: 'demo_s4', questionId: q1, isCorrect: false });
    recordAttempt({ studentId: 'demo_s5', questionId: q1, isCorrect: true });

    // Slow students (> 60s)
    const tNow = nowMs();
    session.students['demo_s6'].currentQuestionId = String(q2);
    session.students['demo_s6'].currentQuestionStartedAtMs = tNow - 95_000;

    endSession(sessionId);
    const report = buildSessionReport(session);
    report.reportName = reportName;
    saveReport(report);
    // Best-effort DB persistence
    reportsDb.saveReport(pool, report).catch((err) => console.error('[report-db] save failed:', err));
    deleteSession(sessionId);

    res.json({ ok: true, sessionId, report: { sessionId: report.sessionId, endedAt: report.endedAt, summary: report.summary } });
  } catch (err) {
    console.error('[POST] create-live-report error:', err);
    res.status(500).json({ error: 'Failed to create live session report' });
  }
});

// Teacher dashboard summary: counts per class and type
app.get('/api/teachers/:teacherId/assignment-summary', async (req, res) => {
  const teacherId = parseInt(req.params.teacherId);
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });
  try {
    await waitForCoreInit();
    await ensureAssignmentAnswerVisibilityExists(pool);
    await ensureAssignmentSubmissionTablesExist(pool);
    await ensureAssignmentsQuestionTablesExist(pool);
    const result = await pool.query(
      `SELECT
         a.class_id,
         a.type,
         COUNT(DISTINCT a.id)::int AS assignments_count,
         COUNT(DISTINCT r.student_id)::int AS assigned_count,
         COUNT(*) FILTER (WHERE s.status IN ('submitted','graded'))::int AS completed_count
       FROM assignments a
       JOIN class_memberships cm
         ON cm.class_id = a.class_id
        AND cm.user_id = $1
        AND cm.membership_type = 'teacher'
       LEFT JOIN assignment_recipients r ON r.assignment_id = a.id
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = r.student_id
       GROUP BY a.class_id, a.type
       ORDER BY a.class_id, a.type`,
      [teacherId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET] Assignment summary error:', err);
    // Surface DB error details in non-prod to unblock demo debugging.
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({
        error: 'Failed to fetch assignment summary',
        detail: String(err?.message || err),
      });
    }
    res.status(500).json({ error: 'Failed to fetch assignment summary' });
  }
});

// Get a single assignment + its questions
app.get('/api/assignments/:assignmentId', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  try {
    await ensureAssignmentAnswerVisibilityExists(pool);
    await ensureQuestionImageDataUrlExists(pool);
    const aRes = await pool.query('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
    if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });

    const qRes = await pool.query(
        `SELECT
          q.id,
          q.topic_id,
          q.prompt,
          q.question_type,
          q.correct_answer,
          q.solution_text,
          q.image_url,
          q.image_data_url,
          q.difficulty,
          q.source,
          q.created_by,
          aq.position,
          aq.points,
         t.name AS topic_name,
         t.key AS topic_key,
         d.name AS domain_name,
         d.key AS domain_key
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       LEFT JOIN topics t ON t.id = q.topic_id
       LEFT JOIN domains d ON d.id = t.domain_id
       WHERE aq.assignment_id = $1
       ORDER BY aq.position ASC`,
      [assignmentId]
    );

    res.json({ assignment: aRes.rows[0], questions: qRes.rows });
  } catch (err) {
    console.error('[GET] Assignment detail error:', err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// Student-safe view of an assignment.
// Answers are only returned if the teacher has enabled answers_visible.
app.get('/api/assignments/:assignmentId/public', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  try {
    await ensureAssignmentAnswerVisibilityExists(pool);
    await ensureQuestionImageDataUrlExists(pool);
    const aRes = await pool.query('SELECT * FROM assignments WHERE id = $1', [assignmentId]);
    if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    const assignment = aRes.rows[0];

    const qRes = await pool.query(
        `SELECT
          q.id,
          q.topic_id,
          q.prompt,
          q.question_type,
          CASE WHEN $2::boolean THEN q.correct_answer ELSE NULL END AS correct_answer,
          CASE WHEN $2::boolean THEN q.solution_text ELSE NULL END AS solution_text,
          q.image_url,
          q.image_data_url,
          q.difficulty,
          q.source,
          aq.position,
          aq.points,
         t.name AS topic_name,
         t.key AS topic_key,
         d.name AS domain_name,
         d.key AS domain_key
       FROM assignment_questions aq
       JOIN questions q ON q.id = aq.question_id
       LEFT JOIN topics t ON t.id = q.topic_id
       LEFT JOIN domains d ON d.id = t.domain_id
       WHERE aq.assignment_id = $1
       ORDER BY aq.position ASC`,
      [assignmentId, Boolean(assignment.answers_visible)]
    );

    res.json({ assignment, questions: qRes.rows });
  } catch (err) {
    console.error('[GET] Assignment public view error:', err);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// Teacher: list submissions for an assignment (who submitted + score)
// Query: ?teacherId=123
app.get('/api/assignments/:assignmentId/submissions', async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId);
  const teacherId = req.query.teacherId ? parseInt(String(req.query.teacherId), 10) : null;
  if (!assignmentId) return res.status(400).json({ error: 'Missing or invalid assignmentId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });

  const client = await pool.connect();
  try {
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const aRes = await client.query(
      `SELECT a.id, a.class_id
       FROM assignments a
       WHERE a.id = $1`,
      [assignmentId]
    );
    if (!aRes.rows.length) return res.status(404).json({ error: 'Assignment not found' });
    const assignment = aRes.rows[0];

    const membership = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [assignment.class_id, teacherId]
    );
    if (!membership.rows.length) return res.status(403).json({ error: 'Not allowed' });

    const subs = await client.query(
      `SELECT
         s.id,
         s.student_id,
         u.name AS student_name,
         s.status,
         s.started_at,
         s.submitted_at,
         s.graded_at,
         s.score,
         s.max_score
       FROM assignment_submissions s
       JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = $1
       ORDER BY u.name ASC`,
      [assignmentId]
    );

    res.json({ assignmentId, submissions: subs.rows });
  } catch (err) {
    console.error('[GET] Assignment submissions error:', err);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  } finally {
    client.release();
  }
});

// Teacher: view one student's submission (answers + workings + marking)
// Query: ?teacherId=123
app.get('/api/submissions/:submissionId', async (req, res) => {
  const submissionId = parseInt(req.params.submissionId);
  const teacherId = req.query.teacherId ? parseInt(String(req.query.teacherId), 10) : null;
  if (!submissionId) return res.status(400).json({ error: 'Missing or invalid submissionId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });

  const client = await pool.connect();
  try {
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentSubmissionTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);

    const sRes = await client.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.status, s.score, s.max_score, s.submitted_at, s.graded_at,
              a.class_id, a.grading_mode
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [submissionId]
    );
    if (!sRes.rows.length) return res.status(404).json({ error: 'Submission not found' });
    const submission = sRes.rows[0];

    const membership = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [submission.class_id, teacherId]
    );
    if (!membership.rows.length) return res.status(403).json({ error: 'Not allowed' });

    const answersRes = await client.query(
      `SELECT
         sa.question_id,
         q.prompt,
         q.question_type,
         q.correct_answer,
         aq.points AS max_points,
         sa.answer AS final_answer,
         sa.workings,
         sa.is_correct,
         sa.points_awarded,
         sa.teacher_points_awarded,
         sa.teacher_feedback,
         sa.teacher_marked_at,
         sa.ai_mark_json,
         sa.ai_marked_at,
         sa.answered_at
       FROM submission_answers sa
       JOIN assignment_questions aq
         ON aq.question_id = sa.question_id
        AND aq.assignment_id = $2
       JOIN questions q ON q.id = sa.question_id
       WHERE sa.submission_id = $1
       ORDER BY aq.position ASC`,
      [submissionId, submission.assignment_id]
    );

    res.json({ submission, answers: answersRes.rows });
  } catch (err) {
    console.error('[GET] Submission detail error:', err);
    res.status(500).json({ error: 'Failed to fetch submission' });
  } finally {
    client.release();
  }
});

// Teacher: manually grade a single answer row
// Body: { teacherId, pointsAwarded, feedback }
app.post('/api/submissions/:submissionId/questions/:questionId/grade', async (req, res) => {
  const submissionId = parseInt(req.params.submissionId);
  const questionId = parseInt(req.params.questionId);
  const teacherId = req.body?.teacherId !== undefined && req.body?.teacherId !== null ? parseInt(String(req.body.teacherId), 10) : null;
  const pointsAwardedIn = req.body?.pointsAwarded;
  const feedback = req.body?.feedback;

  if (!submissionId) return res.status(400).json({ error: 'Missing or invalid submissionId' });
  if (!questionId) return res.status(400).json({ error: 'Missing or invalid questionId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAssignmentAnswerVisibilityExists(client);
    await ensureAssignmentSubmissionTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);

    const sRes = await client.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.status,
              a.class_id
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = $1`,
      [submissionId]
    );
    if (!sRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Submission not found' });
    }
    const submission = sRes.rows[0];

    const membership = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [submission.class_id, teacherId]
    );
    if (!membership.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed' });
    }

    const qRes = await client.query(
      `SELECT aq.points
       FROM assignment_questions aq
       WHERE aq.assignment_id = $1 AND aq.question_id = $2`,
      [submission.assignment_id, questionId]
    );
    if (!qRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Question not found on assignment' });
    }
    const maxPoints = Number(qRes.rows[0].points ?? 1);

    const pts = pointsAwardedIn === undefined || pointsAwardedIn === null || isNaN(+pointsAwardedIn)
      ? null
      : Number(pointsAwardedIn);
    if (pts !== null && (pts < 0 || pts > maxPoints)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `pointsAwarded must be between 0 and ${maxPoints}` });
    }

    // If teacher sets points, we consider it the authoritative awarded points.
    const isCorrect = pts === null ? null : pts >= maxPoints;

    const updated = await client.query(
      `UPDATE submission_answers
       SET teacher_points_awarded = $3,
           teacher_feedback = $4,
           teacher_marked_at = NOW(),
           points_awarded = COALESCE($3, points_awarded),
           is_correct = COALESCE($5, is_correct)
       WHERE submission_id = $1 AND question_id = $2
       RETURNING submission_id, question_id, points_awarded, is_correct, teacher_points_awarded, teacher_feedback, teacher_marked_at`,
      [submissionId, questionId, pts, feedback !== undefined && feedback !== null ? String(feedback) : null, isCorrect]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Answer row not found' });
    }

    // Recompute score/max_score for this submission.
    const maxRes = await client.query(
      `SELECT COALESCE(SUM(points), 0)::float AS max_score
       FROM assignment_questions
       WHERE assignment_id = $1`,
      [submission.assignment_id]
    );
    const scoreRes = await client.query(
      `SELECT COALESCE(SUM(points_awarded), 0)::float AS score
       FROM submission_answers
       WHERE submission_id = $1`,
      [submissionId]
    );
    await client.query(
      `UPDATE assignment_submissions
       SET max_score = $2,
           score = $3,
           graded_at = NOW(),
           status = 'graded'
       WHERE id = $1`,
      [submissionId, maxRes.rows[0].max_score, scoreRes.rows[0].score]
    );

    await client.query('COMMIT');
    res.json({ ok: true, answer: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Manual grade error:', err);
    res.status(500).json({ error: 'Failed to grade' });
  } finally {
    client.release();
  }
});

// Compute-on-read analytics for a class (per student, per topic/domain)
app.get('/api/classes/:classId/student-analytics', async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  const client = await pool.connect();
  try {
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const overallRes = await client.query(
      `WITH answers AS (
         SELECT s.student_id, sa.is_correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         WHERE a.class_id = $1
       )
       SELECT
         student_id,
         COUNT(*)::int AS attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(100.0 * SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) / COUNT(*), 1)
           ELSE 0
         END AS overall_accuracy
       FROM answers
       GROUP BY student_id
       ORDER BY student_id`,
      [classId]
    );

    const submissionsRes = await client.query(
      `SELECT
         s.student_id,
         COUNT(*) FILTER (WHERE s.status IN ('submitted','graded'))::int AS completed_submissions,
         COUNT(*) FILTER (WHERE s.status IN ('not_started','in_progress'))::int AS pending_submissions,
         COUNT(*) FILTER (WHERE s.status = 'missing')::int AS missing_submissions
       FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       WHERE a.class_id = $1
       GROUP BY s.student_id
       ORDER BY s.student_id`,
      [classId]
    );

    const topicRes = await client.query(
      `WITH answers AS (
         SELECT
           s.student_id,
           q.topic_id,
           t.key AS topic_key,
           t.name AS topic_name,
           d.key AS domain_key,
           d.name AS domain_name,
           sa.is_correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
       )
       SELECT
         student_id,
         topic_id,
         topic_key,
         topic_name,
         domain_key,
         domain_name,
         COUNT(*)::int AS attempted,
         SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct,
         CASE WHEN COUNT(*) > 0
           THEN ROUND(100.0 * SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) / COUNT(*), 1)
           ELSE 0
         END AS accuracy
       FROM answers
       GROUP BY student_id, topic_id, topic_key, topic_name, domain_key, domain_name
       ORDER BY student_id, domain_name, topic_name`,
      [classId]
    );

    const domainRes = await client.query(
      `WITH topic_agg AS (
         SELECT
           s.student_id,
           d.key AS domain_key,
           d.name AS domain_name,
           COUNT(*)::int AS attempted,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
         GROUP BY s.student_id, d.key, d.name
       )
       SELECT
         student_id,
         domain_key,
         domain_name,
         attempted,
         correct,
         CASE WHEN attempted > 0 THEN ROUND(100.0 * correct / attempted, 1) ELSE 0 END AS accuracy
       FROM topic_agg
       ORDER BY student_id, domain_name`,
      [classId]
    );

    const byStudent = new Map();
    for (const r of overallRes.rows) {
      byStudent.set(r.student_id, {
        student_id: r.student_id,
        attempted: r.attempted,
        correct: r.correct,
        overall_accuracy: Number(r.overall_accuracy) || 0,
        completed_submissions: 0,
        pending_submissions: 0,
        missing_submissions: 0,
        topic_scores: [],
        domain_scores: [],
      });
    }
    for (const r of submissionsRes.rows) {
      const row = byStudent.get(r.student_id) || {
        student_id: r.student_id,
        attempted: 0,
        correct: 0,
        overall_accuracy: 0,
        completed_submissions: 0,
        pending_submissions: 0,
        missing_submissions: 0,
        topic_scores: [],
        domain_scores: [],
      };
      row.completed_submissions = Number(r.completed_submissions) || 0;
      row.pending_submissions = Number(r.pending_submissions) || 0;
      row.missing_submissions = Number(r.missing_submissions) || 0;
      byStudent.set(r.student_id, row);
    }
    for (const r of topicRes.rows) {
      const row = byStudent.get(r.student_id) || {
        student_id: r.student_id,
        attempted: 0,
        correct: 0,
        overall_accuracy: 0,
        completed_submissions: 0,
        pending_submissions: 0,
        missing_submissions: 0,
        topic_scores: [],
        domain_scores: [],
      };
      row.topic_scores.push({
        topic_id: r.topic_id,
        topic_key: r.topic_key,
        topic_name: r.topic_name,
        domain_key: r.domain_key,
        domain_name: r.domain_name,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        accuracy: Number(r.accuracy) || 0,
      });
      byStudent.set(r.student_id, row);
    }
    for (const r of domainRes.rows) {
      const row = byStudent.get(r.student_id) || {
        student_id: r.student_id,
        attempted: 0,
        correct: 0,
        overall_accuracy: 0,
        completed_submissions: 0,
        pending_submissions: 0,
        missing_submissions: 0,
        topic_scores: [],
        domain_scores: [],
      };
      row.domain_scores.push({
        domain_key: r.domain_key,
        domain_name: r.domain_name,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        accuracy: Number(r.accuracy) || 0,
      });
      byStudent.set(r.student_id, row);
    }

    res.json({ classId, students: Array.from(byStudent.values()) });
  } catch (err) {
    console.error('[GET] Class student analytics error:', err);
    res.status(500).json({ error: 'Failed to compute student analytics' });
  } finally {
    client.release();
  }
});

// Domain radars for a student in a class.
// - baseline: latest submitted diagnostic attempt (domain scores snapshot)
// - current: assignment performance since that baseline (only submitted/graded submissions)
// Teacher callers should pass ?teacherId=123 to enforce membership.
app.get('/api/classes/:classId/students/:studentId/domain-radar', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const studentId = parseInt(req.params.studentId);
  const teacherId = req.query.teacherId !== undefined && req.query.teacherId !== null && String(req.query.teacherId).trim() !== ''
    ? parseInt(String(req.query.teacherId), 10)
    : null;
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

  const client = await pool.connect();
  try {
    await ensureDiagnosticTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureAssignmentSubmissionTablesExist(client);

    // Demo: freeze the domain radar for Student One so it cannot change during demos.
    // This endpoint is used by both the teacher class detail page and the student class page.
    const studentEmailRes = await client.query(
      'SELECT email FROM users WHERE id = $1 LIMIT 1',
      [studentId]
    );
    const studentEmail = String(studentEmailRes.rows?.[0]?.email || '').toLowerCase();
    const isDemoStudentOne = studentEmail === 'student1@demo.com';

    // Verify student is in the class.
    const sMem = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!sMem.rows.length) return res.status(403).json({ error: 'Student not enrolled in this class' });

    // Optional: verify teacher membership (teacher dashboard calls should include teacherId)
    if (teacherId) {
      const tMem = await client.query(
        `SELECT 1
         FROM class_memberships
         WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
         LIMIT 1`,
        [classId, teacherId]
      );
      if (!tMem.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });
    }

    if (isDemoStudentOne) {
      const domainOrder = ['number', 'algebra', 'measures', 'shape_space', 'data_handling'];
      const baselineSubmittedAt = '2026-01-15T10:00:00.000Z';
      const baselineByKey = {
        number: 62,
        algebra: 58,
        measures: 60,
        shape_space: 42,
        data_handling: 35,
      };
      const bump = {
        number: -10,
        algebra: -8,
        measures: -6,
        shape_space: 10,
        data_handling: 20,
      };

      const baselineScores = domainOrder.map((k) => ({
        domain_key: k,
        correct: 0,
        total: 0,
        percent: clampPercent(baselineByKey[k] ?? 0),
      }));
      const currentScores = domainOrder.map((k) => ({
        domain_key: k,
        attempted: 0,
        correct: 0,
        percent: clampPercent((baselineByKey[k] ?? 0) + (bump[k] ?? 0)),
      }));

      return res.json({
        classId,
        studentId,
        baseline: {
          attemptId: null,
          sessionId: null,
          submittedAt: baselineSubmittedAt,
          domainScores: baselineScores,
        },
        current: {
          since: baselineSubmittedAt,
          domainScores: currentScores,
        },
      });
    }

    // Baseline diagnostic attempt for this student in this class.
    // If a baseline is pinned, it should not change even if the student
    // takes new diagnostics (useful for demo flows).
    const baselineAttemptRes = await client.query(
      `SELECT a.id, a.submitted_at, a.session_id
       FROM diagnostic_baselines b
       JOIN diagnostic_attempts a ON a.id = b.attempt_id
       JOIN diagnostic_sessions s ON s.id = a.session_id
       WHERE b.class_id = $1
         AND b.student_id = $2
       LIMIT 1`,
      [classId, studentId]
    );

    const fallbackAttemptRes = baselineAttemptRes.rows.length
      ? { rows: [] }
      : await client.query(
          `SELECT a.id, a.submitted_at, a.session_id
           FROM diagnostic_attempts a
           JOIN diagnostic_sessions s ON s.id = a.session_id
           WHERE s.class_id = $1
             AND a.student_id = $2
             AND a.status = 'submitted'
             AND a.submitted_at IS NOT NULL
           ORDER BY a.submitted_at DESC
           LIMIT 1`,
          [classId, studentId]
        );

    const baselineAttempt = baselineAttemptRes.rows[0] || fallbackAttemptRes.rows[0] || null;
    const baselineSubmittedAt = baselineAttempt?.submitted_at || null;
    const baselineAttemptId = baselineAttempt?.id || null;

    const baselineScoresRes = baselineAttemptId
      ? await client.query(
          `SELECT domain_key, correct, total, percent
           FROM diagnostic_domain_scores
           WHERE attempt_id = $1
           ORDER BY domain_key`,
          [baselineAttemptId]
        )
      : { rows: [] };

    // Current radar from assignment work since baseline.
    // We treat "assignment done" as submitted/graded.
    const currentScoresRes = await client.query(
      `WITH ans AS (
         SELECT
           d.key AS domain_key,
           COUNT(*)::int AS attempted,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
           AND s.student_id = $2
           AND s.status IN ('submitted','graded')
           AND d.key IS NOT NULL
           AND ($3::timestamp IS NULL OR sa.answered_at >= $3::timestamp)
       GROUP BY d.key
      )
      SELECT
        domain_key,
        attempted,
        correct,
        CASE WHEN attempted > 0 THEN ROUND(100.0 * correct / attempted, 1) ELSE 0 END AS percent
      FROM ans
      ORDER BY domain_key`,
      [classId, studentId, baselineSubmittedAt]
    );

    // Ensure the frontend always receives a full, stable domain list in a predictable order.
    // Missing domains are returned with 0s to avoid chart re-shaping between renders.
    const domainOrder = ['number', 'algebra', 'measures', 'shape_space', 'data_handling'];
    const baselineByKey = new Map(
      (baselineScoresRes.rows || []).map((r) => [String(r.domain_key), r])
    );
    const currentByKey = new Map(
      (currentScoresRes.rows || []).map((r) => [String(r.domain_key), r])
    );
    const baselineScores = domainOrder.map((k) => {
      const r = baselineByKey.get(k) || null;
      return {
        domain_key: k,
        correct: r ? Number(r.correct ?? 0) : 0,
        total: r ? Number(r.total ?? 0) : 0,
        percent: clampPercent(r ? r.percent : 0),
      };
    });
    const currentScores = domainOrder.map((k) => {
      const r = currentByKey.get(k) || null;
      return {
        domain_key: k,
        attempted: r ? Number(r.attempted ?? 0) : 0,
        correct: r ? Number(r.correct ?? 0) : 0,
        percent: clampPercent(r ? r.percent : 0),
      };
    });

    res.json({
      classId,
      studentId,
      baseline: baselineAttempt
        ? {
            attemptId: baselineAttemptId,
            sessionId: baselineAttempt.session_id,
            submittedAt: baselineSubmittedAt,
            domainScores: baselineScores,
          }
        : null,
      current: {
        since: baselineSubmittedAt,
        domainScores: currentScores,
      },
    });
  } catch (err) {
    console.error('[GET] Domain radar error:', err);
    res.status(500).json({ error: 'Failed to compute domain radar' });
  } finally {
    client.release();
  }
});

// Teacher: get / set per-class thresholds
app.get('/api/classes/:classId/thresholds', async (req, res) => {
  const classId = parseInt(req.params.classId);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  try {
    await ensureRiskTablesExist(pool);
    const r = await pool.query(
      `SELECT class_id, high_risk_threshold, mastery_threshold, updated_by, updated_at
       FROM class_thresholds
       WHERE class_id = $1`,
      [classId]
    );
    if (r.rows.length) return res.json(r.rows[0]);
    // Default thresholds when not configured yet.
    return res.json({ class_id: classId, high_risk_threshold: 50, mastery_threshold: 70 });
  } catch (err) {
    console.error('[GET] Class thresholds error:', err);
    return res.status(500).json({ error: 'Failed to fetch thresholds' });
  }
});

app.post('/api/classes/:classId/thresholds', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const teacherId = req.body?.teacherId !== undefined && req.body?.teacherId !== null ? parseInt(String(req.body.teacherId), 10) : null;
  const highRisk = clampInt(req.body?.highRiskThreshold, 0, 100, null);
  const mastery = clampInt(req.body?.masteryThreshold, 0, 100, null);
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });
  if (highRisk === null || mastery === null) return res.status(400).json({ error: 'Missing thresholds' });
  if (mastery < highRisk) return res.status(400).json({ error: 'masteryThreshold must be >= highRiskThreshold' });

  const client = await pool.connect();
  try {
    await ensureRiskTablesExist(client);
    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [classId, teacherId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });

    const up = await client.query(
      `INSERT INTO class_thresholds (class_id, high_risk_threshold, mastery_threshold, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (class_id) DO UPDATE
         SET high_risk_threshold = EXCLUDED.high_risk_threshold,
             mastery_threshold = EXCLUDED.mastery_threshold,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
       RETURNING class_id, high_risk_threshold, mastery_threshold, updated_by, updated_at`,
      [classId, highRisk, mastery, teacherId]
    );
    return res.json(up.rows[0]);
  } catch (err) {
    console.error('[POST] Class thresholds error:', err);
    return res.status(500).json({ error: 'Failed to update thresholds' });
  } finally {
    client.release();
  }
});

// Teacher: risk classification for a class (domain + overall) with overrides applied
app.get('/api/classes/:classId/risk', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const teacherId = req.query.teacherId ? parseInt(String(req.query.teacherId), 10) : null;
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });

  const client = await pool.connect();
  try {
    await ensureRiskTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [classId, teacherId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });

    const tRes = await client.query(
      `SELECT COALESCE(ct.high_risk_threshold, 50)::int AS high_risk_threshold,
              COALESCE(ct.mastery_threshold, 70)::int AS mastery_threshold
       FROM (SELECT $1::int AS class_id) x
       LEFT JOIN class_thresholds ct ON ct.class_id = x.class_id`,
      [classId]
    );
    const thresholds = tRes.rows[0] || { high_risk_threshold: 50, mastery_threshold: 70 };

    const studentsRes = await client.query(
      `SELECT u.id AS student_id, u.name AS student_name
       FROM class_memberships cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = $1 AND cm.membership_type = 'student'
       ORDER BY u.id`,
      [classId]
    );

    // Domain accuracies for each student (all-time in class)
    const domainRes = await client.query(
      `WITH ans AS (
         SELECT
           s.student_id,
           d.key AS domain_key,
           COUNT(*)::int AS attempted,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
           AND s.status IN ('submitted','graded')
           AND d.key IS NOT NULL
         GROUP BY s.student_id, d.key
      )
      SELECT
        student_id,
        domain_key,
        attempted,
        correct,
        CASE WHEN attempted > 0 THEN ROUND(100.0 * correct / attempted, 1) ELSE 0 END AS percent
      FROM ans
      ORDER BY student_id, domain_key`,
      [classId]
    );

    const overridesRes = await client.query(
      `SELECT DISTINCT ON (class_id, student_id, scope, COALESCE(domain_key, ''))
         class_id, student_id, scope, domain_key, system_label, override_label, reason, created_by, created_at
       FROM risk_overrides
       WHERE class_id = $1
       ORDER BY class_id, student_id, scope, COALESCE(domain_key, ''), created_at DESC`,
      [classId]
    );

    const overrideByKey = new Map();
    for (const o of overridesRes.rows || []) {
      const k = `${o.student_id}:${o.scope}:${o.domain_key || ''}`;
      overrideByKey.set(k, o);
    }

    const domainsByStudent = new Map();
    for (const r of domainRes.rows || []) {
      const k = String(r.student_id);
      const list = domainsByStudent.get(k) || [];
      const systemLabel = computeRiskLabel(Number(r.percent), {
        highRisk: thresholds.high_risk_threshold,
        mastery: thresholds.mastery_threshold,
      });
      const ov = overrideByKey.get(`${r.student_id}:domain:${r.domain_key}`) || null;
      const finalLabel = ov ? String(ov.override_label) : systemLabel;
      list.push({
        domain_key: r.domain_key,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        percent: Number(r.percent) || 0,
        system_label: systemLabel,
        final_label: finalLabel,
        override: ov
          ? {
              override_label: ov.override_label,
              reason: ov.reason,
              created_by: ov.created_by,
              created_at: ov.created_at,
            }
          : null,
      });
      domainsByStudent.set(k, list);
    }

    const out = (studentsRes.rows || []).map((s) => {
      const domainRows = domainsByStudent.get(String(s.student_id)) || [];
      const systemOverall = worstLabel(domainRows.map((d) => d.system_label));
      const ovOverall = overrideByKey.get(`${s.student_id}:overall:`) || null;
      const finalOverall = ovOverall ? String(ovOverall.override_label) : systemOverall;
      return {
        student_id: s.student_id,
        student_name: s.student_name,
        overall: {
          system_label: systemOverall,
          final_label: finalOverall,
          system_label_ui: riskLabelToUi(systemOverall),
          final_label_ui: riskLabelToUi(finalOverall),
          override: ovOverall
            ? {
                override_label: ovOverall.override_label,
                reason: ovOverall.reason,
                created_by: ovOverall.created_by,
                created_at: ovOverall.created_at,
              }
            : null,
        },
        domains: domainRows,
      };
    });

    return res.json({ classId, thresholds, students: out });
  } catch (err) {
    console.error('[GET] Class risk error:', err);
    return res.status(500).json({ error: 'Failed to compute risk' });
  } finally {
    client.release();
  }
});

// Teacher: create a risk override (audit logged)
app.post('/api/classes/:classId/risk-overrides', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const teacherId = req.body?.teacherId !== undefined && req.body?.teacherId !== null ? parseInt(String(req.body.teacherId), 10) : null;
  const studentId = req.body?.studentId !== undefined && req.body?.studentId !== null ? parseInt(String(req.body.studentId), 10) : null;
  const scope = String(req.body?.scope || '').toLowerCase();
  const domainKey = req.body?.domainKey !== undefined && req.body?.domainKey !== null ? String(req.body.domainKey) : null;
  const overrideLabel = String(req.body?.overrideLabel || '').toLowerCase();
  const reason = req.body?.reason !== undefined && req.body?.reason !== null ? String(req.body.reason) : null;
  const systemLabel = String(req.body?.systemLabel || '').toLowerCase();

  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (scope !== 'overall' && scope !== 'domain') return res.status(400).json({ error: "scope must be 'overall' or 'domain'" });
  if (scope === 'domain' && (!domainKey || !domainKey.trim())) return res.status(400).json({ error: 'domainKey required for domain overrides' });
  if (overrideLabel !== 'high_risk' && overrideLabel !== 'developing' && overrideLabel !== 'mastery') {
    return res.status(400).json({ error: 'Invalid overrideLabel' });
  }
  if (systemLabel !== 'high_risk' && systemLabel !== 'developing' && systemLabel !== 'mastery' && systemLabel !== 'insufficient_data') {
    return res.status(400).json({ error: 'Invalid systemLabel' });
  }

  const client = await pool.connect();
  try {
    await ensureRiskTablesExist(client);
    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [classId, teacherId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });

    const ins = await client.query(
      `INSERT INTO risk_overrides (class_id, student_id, scope, domain_key, system_label, override_label, reason, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [classId, studentId, scope, scope === 'domain' ? domainKey : null, systemLabel, overrideLabel, reason, teacherId]
    );
    return res.json({ ok: true, override: ins.rows[0] });
  } catch (err) {
    console.error('[POST] Risk override error:', err);
    return res.status(500).json({ error: 'Failed to create override' });
  } finally {
    client.release();
  }
});

// Teacher: adaptive difficulty tiers by topic for a student in a class
app.get('/api/classes/:classId/students/:studentId/adaptive-difficulty', async (req, res) => {
  const classId = parseInt(req.params.classId);
  const studentId = parseInt(req.params.studentId);
  const teacherId = req.query.teacherId ? parseInt(String(req.query.teacherId), 10) : null;
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!teacherId) return res.status(400).json({ error: 'Missing or invalid teacherId' });

  const client = await pool.connect();
  try {
    await ensureRiskTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureAssignmentSubmissionTablesExist(client);

    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'teacher'
       LIMIT 1`,
      [classId, teacherId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not a teacher of this class' });

    const tRes = await client.query(
      `SELECT COALESCE(ct.high_risk_threshold, 50)::int AS high_risk_threshold,
              COALESCE(ct.mastery_threshold, 70)::int AS mastery_threshold
       FROM (SELECT $1::int AS class_id) x
       LEFT JOIN class_thresholds ct ON ct.class_id = x.class_id`,
      [classId]
    );
    const thresholds = tRes.rows[0] || { high_risk_threshold: 50, mastery_threshold: 70 };

    const topicRes = await client.query(
      `WITH ans AS (
         SELECT
           q.topic_id,
           t.key AS topic_key,
           t.name AS topic_name,
           d.key AS domain_key,
           d.name AS domain_name,
           COUNT(*)::int AS attempted,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
           AND s.student_id = $2
           AND s.status IN ('submitted','graded')
           AND q.topic_id IS NOT NULL
         GROUP BY q.topic_id, t.key, t.name, d.key, d.name
      )
      SELECT
        topic_id,
        topic_key,
        topic_name,
        domain_key,
        domain_name,
        attempted,
        correct,
        CASE WHEN attempted > 0 THEN ROUND(100.0 * correct / attempted, 1) ELSE 0 END AS accuracy
      FROM ans
      ORDER BY domain_name, topic_name`,
      [classId, studentId]
    );

    const tiers = (topicRes.rows || []).map((r) => {
      const acc = Number(r.accuracy) || 0;
      let tier = 2;
      if (acc < thresholds.high_risk_threshold) tier = 1;
      else if (acc >= thresholds.mastery_threshold) tier = 3;
      return {
        topic_id: r.topic_id,
        topic_key: r.topic_key,
        topic_name: r.topic_name,
        domain_key: r.domain_key,
        domain_name: r.domain_name,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        accuracy: acc,
        tier,
      };
    });

    return res.json({ classId, studentId, thresholds, topics: tiers });
  } catch (err) {
    console.error('[GET] Adaptive difficulty error:', err);
    return res.status(500).json({ error: 'Failed to compute adaptive difficulty' });
  } finally {
    client.release();
  }
});

// Student: practice recommendations for a class
// Uses deterministic tiering by topic based on the student's recent submitted/graded work.
app.get('/api/students/:studentId/classes/:classId/practice-recommendations', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const classId = parseInt(req.params.classId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });

  const limit = req.query?.limit !== undefined && req.query?.limit !== null && !isNaN(+req.query.limit)
    ? Math.max(1, Math.min(50, parseInt(String(req.query.limit), 10)))
    : 12;

  const client = await pool.connect();
  try {
    await ensureRiskTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureAssignmentSubmissionTablesExist(client);

    // Verify student is in the class
    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    const tRes = await client.query(
      `SELECT COALESCE(ct.high_risk_threshold, 50)::int AS high_risk_threshold,
              COALESCE(ct.mastery_threshold, 70)::int AS mastery_threshold
       FROM (SELECT $1::int AS class_id) x
       LEFT JOIN class_thresholds ct ON ct.class_id = x.class_id`,
      [classId]
    );
    const thresholds = tRes.rows[0] || { high_risk_threshold: 50, mastery_threshold: 70 };

    const topicRes = await client.query(
      `WITH ans AS (
         SELECT
           q.topic_id,
           t.key AS topic_key,
           t.name AS topic_name,
           d.key AS domain_key,
           d.name AS domain_name,
           COUNT(*)::int AS attempted,
           SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END)::int AS correct
         FROM assignment_submissions s
         JOIN assignments a ON a.id = s.assignment_id
         JOIN submission_answers sa ON sa.submission_id = s.id
         JOIN questions q ON q.id = sa.question_id
         LEFT JOIN topics t ON t.id = q.topic_id
         LEFT JOIN domains d ON d.id = t.domain_id
         WHERE a.class_id = $1
           AND s.student_id = $2
           AND s.status IN ('submitted','graded')
           AND q.topic_id IS NOT NULL
         GROUP BY q.topic_id, t.key, t.name, d.key, d.name
      )
      SELECT
        topic_id,
        topic_key,
        topic_name,
        domain_key,
        domain_name,
        attempted,
        correct,
        CASE WHEN attempted > 0 THEN ROUND(100.0 * correct / attempted, 1) ELSE 0 END AS accuracy
      FROM ans
      ORDER BY accuracy ASC, attempted DESC`,
      [classId, studentId]
    );

    const tiers = (topicRes.rows || []).map((r) => {
      const acc = Number(r.accuracy) || 0;
      let tier = 2;
      if (acc < thresholds.high_risk_threshold) tier = 1;
      else if (acc >= thresholds.mastery_threshold) tier = 3;
      return {
        topic_id: r.topic_id,
        topic_key: r.topic_key,
        topic_name: r.topic_name,
        domain_key: r.domain_key,
        domain_name: r.domain_name,
        attempted: Number(r.attempted) || 0,
        correct: Number(r.correct) || 0,
        accuracy: acc,
        tier,
      };
    });

    const sorted = [...tiers].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return String(a.topic_name || '').localeCompare(String(b.topic_name || ''));
    });

    return res.json({ classId, studentId, thresholds, recommendations: sorted.slice(0, limit) });
  } catch (err) {
    console.error('[GET] Practice recommendations error:', err);
    return res.status(500).json({ error: 'Failed to fetch practice recommendations' });
  } finally {
    client.release();
  }
});

// Student: create an AI practice set (persisted)
// Body: { topicId, domainKey, topicName, difficulty, count }
app.post('/api/students/:studentId/classes/:classId/practice-sets', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const classId = parseInt(req.params.classId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });

  const topicId = req.body?.topicId !== undefined && req.body?.topicId !== null && !isNaN(+req.body.topicId)
    ? parseInt(String(req.body.topicId), 10)
    : null;
  const domainKey = req.body?.domainKey ? String(req.body.domainKey) : null;
  const topicName = req.body?.topicName ? String(req.body.topicName) : null;
  const count = req.body?.count !== undefined && req.body?.count !== null && !isNaN(+req.body.count)
    ? Math.max(3, Math.min(20, parseInt(String(req.body.count), 10)))
    : 8;
  const difficultyRaw = String(req.body?.difficulty || 'medium').toLowerCase();
  const difficulty = difficultyRaw === 'easy' || difficultyRaw === 'hard' ? difficultyRaw : 'medium';

  if (!domainKey) return res.status(400).json({ error: 'Missing domainKey' });
  if (!topicId) return res.status(400).json({ error: 'Missing topicId' });
  if (!topicName) return res.status(400).json({ error: 'Missing topicName' });

  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL is not configured on the backend' });
  }
  const PRACTICE_WEBHOOK_URL = process.env.N8N_PRACTICE_WEBHOOK_URL;
  if (!PRACTICE_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_PRACTICE_WEBHOOK_URL is not configured on the backend' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensurePracticeTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    await ensureQuestionSolutionTextExists(client);
    await ensureQuestionImageDataUrlExists(client);

    // verify student membership
    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not enrolled in this class' });
    }

    const title = `Practice: ${topicName}`;
    const setRes = await client.query(
      `INSERT INTO practice_sets (class_id, student_id, domain_key, topic_id, title, difficulty, source, answers_visible, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ai', TRUE, NOW())
       RETURNING *`,
      [classId, studentId, domainKey, topicId, title, difficulty]
    );
    const practiceSet = setRes.rows[0];

    // Call n8n practice generator
    const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const payload = {
      mode: 'practice_set',
      request_id: requestId,
      class_id: classId,
      student_id: studentId,
      domain_key: String(domainKey),
      topic_id: topicId,
      topic: String(topicName),
      difficulty,
      num_questions: count,
    };

    const resp = await fetch(PRACTICE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      await client.query('ROLLBACK');
      console.error('[POST] n8n practice error:', resp.status, text);
      return res.status(502).json({ error: 'Practice generation failed' });
    }
    const rawText = await resp.text().catch(() => '');
    if (!rawText || !rawText.trim()) {
      await client.query('ROLLBACK');
      return res.status(502).json({ error: 'Practice generator returned empty response' });
    }
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      await client.query('ROLLBACK');
      return res.status(502).json({ error: 'Practice generator returned invalid JSON' });
    }

    const qs = Array.isArray(data?.questions) ? data.questions : [];
    if (qs.length === 0) {
      await client.query('ROLLBACK');
      return res.status(502).json({ error: 'Practice generator returned no questions' });
    }

    let pos = 0;
    const inserted = [];
    for (const q of qs) {
      const norm = normalizePracticeGeneratedQuestion(q);
      if (!norm.prompt) continue;
      pos += 1;

      const qRes = await client.query(
        `INSERT INTO questions (topic_id, prompt, question_type, correct_answer, solution_text, image_url, image_data_url, difficulty, source, created_by)
         VALUES ($1, $2, 'short', $3, $4, $5, $6, $7, 'ai', NULL)
         RETURNING id, prompt, correct_answer, solution_text, image_url, image_data_url, difficulty`,
        [topicId, norm.prompt, norm.finalAnswer, norm.solutionText, norm.imageUrl, norm.imageDataUrl, norm.difficulty]
      );
      const newQ = qRes.rows[0];
      inserted.push(newQ);

      await client.query(
        `INSERT INTO practice_set_questions (practice_set_id, question_id, position, points)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT DO NOTHING`,
        [practiceSet.id, newQ.id, pos]
      );
    }

    if (inserted.length === 0) {
      await client.query('ROLLBACK');
      return res.status(502).json({ error: 'Practice generator questions were empty after normalization' });
    }

    await client.query('COMMIT');
    return res.json({ ok: true, practiceSet, questions: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Create practice set error:', err);
    return res.status(500).json({ error: 'Failed to create practice set' });
  } finally {
    client.release();
  }
});

// Student: list practice history for a class
app.get('/api/students/:studentId/classes/:classId/practice-history', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  const classId = parseInt(req.params.classId);
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!classId) return res.status(400).json({ error: 'Missing or invalid classId' });

  const limit = req.query?.limit !== undefined && req.query?.limit !== null && !isNaN(+req.query.limit)
    ? Math.max(1, Math.min(50, parseInt(String(req.query.limit), 10)))
    : 20;

  const client = await pool.connect();
  try {
    await ensurePracticeTablesExist(client);

    const m = await client.query(
      `SELECT 1
       FROM class_memberships
       WHERE class_id = $1 AND user_id = $2 AND membership_type = 'student'
       LIMIT 1`,
      [classId, studentId]
    );
    if (!m.rows.length) return res.status(403).json({ error: 'Not enrolled in this class' });

    const r = await client.query(
      `SELECT
         ps.id AS practice_set_id,
         ps.title,
         ps.domain_key,
         ps.topic_id,
         ps.difficulty,
         ps.created_at,
         pa.id AS attempt_id,
         pa.status,
         pa.started_at,
         pa.submitted_at,
         pa.score,
         pa.max_score
       FROM practice_sets ps
       LEFT JOIN practice_attempts pa
         ON pa.practice_set_id = ps.id AND pa.student_id = $2
       WHERE ps.class_id = $1 AND ps.student_id = $2
       ORDER BY ps.created_at DESC
       LIMIT $3`,
      [classId, studentId, limit]
    );

    return res.json({ classId, studentId, history: r.rows || [] });
  } catch (err) {
    console.error('[GET] Practice history error:', err);
    return res.status(500).json({ error: 'Failed to fetch practice history' });
  } finally {
    client.release();
  }
});

// Student: start/resume a practice attempt
app.post('/api/practice-sets/:practiceSetId/attempts', async (req, res) => {
  const practiceSetId = parseInt(req.params.practiceSetId);
  const studentId = req.body?.studentId !== undefined && req.body?.studentId !== null ? parseInt(String(req.body.studentId), 10) : null;
  if (!practiceSetId) return res.status(400).json({ error: 'Missing or invalid practiceSetId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

  const client = await pool.connect();
  try {
    await ensurePracticeTablesExist(client);

    const setRes = await client.query(
      `SELECT id, class_id, student_id
       FROM practice_sets
       WHERE id = $1`,
      [practiceSetId]
    );
    if (!setRes.rows.length) return res.status(404).json({ error: 'Practice set not found' });
    const setRow = setRes.rows[0];
    if (Number(setRow.student_id) !== Number(studentId)) return res.status(403).json({ error: 'Not allowed' });

    const aRes = await client.query(
      `INSERT INTO practice_attempts (practice_set_id, student_id, status, started_at)
       VALUES ($1, $2, 'in_progress', NOW())
       ON CONFLICT (practice_set_id, student_id) DO UPDATE
         SET status = CASE WHEN practice_attempts.status = 'submitted' THEN 'submitted' ELSE 'in_progress' END
       RETURNING *`,
      [practiceSetId, studentId]
    );
    return res.json({ ok: true, attempt: aRes.rows[0] });
  } catch (err) {
    console.error('[POST] Practice attempt start error:', err);
    return res.status(500).json({ error: 'Failed to start attempt' });
  } finally {
    client.release();
  }
});

// Student: view a practice set + questions (answers always visible per your requirement)
app.get('/api/practice-sets/:practiceSetId', async (req, res) => {
  const practiceSetId = parseInt(req.params.practiceSetId);
  const studentId = req.query.studentId ? parseInt(String(req.query.studentId), 10) : null;
  if (!practiceSetId) return res.status(400).json({ error: 'Missing or invalid practiceSetId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

  const client = await pool.connect();
  try {
    await ensurePracticeTablesExist(client);
    await ensureQuestionSolutionTextExists(client);
    await ensureQuestionImageDataUrlExists(client);

    const setRes = await client.query(
      `SELECT *
       FROM practice_sets
       WHERE id = $1`,
      [practiceSetId]
    );
    if (!setRes.rows.length) return res.status(404).json({ error: 'Practice set not found' });
    const setRow = setRes.rows[0];
    if (Number(setRow.student_id) !== Number(studentId)) return res.status(403).json({ error: 'Not allowed' });

    const qRes = await client.query(
      `SELECT
         q.id,
         q.prompt,
         q.correct_answer,
         q.solution_text,
         q.image_url,
         q.image_data_url,
         psq.position,
         psq.points
       FROM practice_set_questions psq
       JOIN questions q ON q.id = psq.question_id
       WHERE psq.practice_set_id = $1
       ORDER BY psq.position ASC`,
      [practiceSetId]
    );

    const attemptRes = await client.query(
      `SELECT *
       FROM practice_attempts
       WHERE practice_set_id = $1 AND student_id = $2`,
      [practiceSetId, studentId]
    );
    const attempt = attemptRes.rows[0] || null;

    let answers = [];
    if (attempt?.id) {
      const ansRes = await client.query(
        `SELECT question_id, answer, workings, is_correct, points_awarded, answered_at
         FROM practice_answers
         WHERE attempt_id = $1`,
        [attempt.id]
      );
      answers = ansRes.rows || [];
    }

    return res.json({ practiceSet: setRow, questions: qRes.rows || [], attempt, answers });
  } catch (err) {
    console.error('[GET] Practice set view error:', err);
    return res.status(500).json({ error: 'Failed to fetch practice set' });
  } finally {
    client.release();
  }
});

// Student: save a practice answer (auto marking)
app.post('/api/practice-attempts/:attemptId/answer', async (req, res) => {
  const attemptId = parseInt(req.params.attemptId);
  const studentId = req.body?.studentId !== undefined && req.body?.studentId !== null ? parseInt(String(req.body.studentId), 10) : null;
  const questionId = req.body?.questionId !== undefined && req.body?.questionId !== null ? parseInt(String(req.body.questionId), 10) : null;
  const finalAnswer = req.body?.finalAnswer;
  const workings = req.body?.workings;
  const responseTimeMs = req.body?.responseTimeMs;

  if (!attemptId) return res.status(400).json({ error: 'Missing or invalid attemptId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });
  if (!questionId) return res.status(400).json({ error: 'Missing or invalid questionId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensurePracticeTablesExist(client);
    await ensureAssignmentsQuestionTablesExist(client);

    const aRes = await client.query(
      `SELECT pa.id, pa.status, ps.id AS practice_set_id, ps.student_id
       FROM practice_attempts pa
       JOIN practice_sets ps ON ps.id = pa.practice_set_id
       WHERE pa.id = $1`,
      [attemptId]
    );
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attempt not found' });
    }
    const attempt = aRes.rows[0];
    if (Number(attempt.student_id) !== Number(studentId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (String(attempt.status) === 'submitted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Attempt already submitted' });
    }

    const qRes = await client.query(
      `SELECT q.correct_answer, psq.points
       FROM practice_set_questions psq
       JOIN questions q ON q.id = psq.question_id
       WHERE psq.practice_set_id = $1 AND psq.question_id = $2`,
      [attempt.practice_set_id, questionId]
    );
    if (!qRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Question not found on this practice set' });
    }
    const expectedTrimmed = String(qRes.rows[0].correct_answer ?? '').trim();
    const points = Number(qRes.rows[0].points ?? 1);

    let isCorrect = null;
    let pointsAwarded = null;
    if (expectedTrimmed) {
      isCorrect = answersEquivalent(String(finalAnswer ?? ''), expectedTrimmed);
      pointsAwarded = isCorrect ? points : 0;
    }

    await client.query(
      `INSERT INTO practice_answers
         (attempt_id, question_id, answer, workings, is_correct, points_awarded, response_time_ms, answered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (attempt_id, question_id) DO UPDATE
         SET answer = EXCLUDED.answer,
             workings = EXCLUDED.workings,
             is_correct = EXCLUDED.is_correct,
             points_awarded = EXCLUDED.points_awarded,
             response_time_ms = EXCLUDED.response_time_ms,
             answered_at = NOW()`,
      [
        attemptId,
        questionId,
        finalAnswer !== undefined && finalAnswer !== null ? String(finalAnswer) : null,
        workings !== undefined && workings !== null ? String(workings) : null,
        isCorrect,
        pointsAwarded,
        responseTimeMs !== undefined && responseTimeMs !== null && !isNaN(+responseTimeMs) ? parseInt(responseTimeMs, 10) : null,
      ]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, isCorrect, pointsAwarded });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Practice answer error:', err);
    return res.status(500).json({ error: 'Failed to save answer' });
  } finally {
    client.release();
  }
});

// Student: submit practice attempt (compute score/max)
app.post('/api/practice-attempts/:attemptId/submit', async (req, res) => {
  const attemptId = parseInt(req.params.attemptId);
  const studentId = req.body?.studentId !== undefined && req.body?.studentId !== null ? parseInt(String(req.body.studentId), 10) : null;
  if (!attemptId) return res.status(400).json({ error: 'Missing or invalid attemptId' });
  if (!studentId) return res.status(400).json({ error: 'Missing or invalid studentId' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensurePracticeTablesExist(client);

    const aRes = await client.query(
      `SELECT pa.id, pa.status, pa.practice_set_id, ps.student_id
       FROM practice_attempts pa
       JOIN practice_sets ps ON ps.id = pa.practice_set_id
       WHERE pa.id = $1`,
      [attemptId]
    );
    if (!aRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attempt not found' });
    }
    const attempt = aRes.rows[0];
    if (Number(attempt.student_id) !== Number(studentId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (String(attempt.status) === 'submitted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Attempt already submitted' });
    }

    const maxRes = await client.query(
      `SELECT COALESCE(SUM(points), 0)::float AS max_score
       FROM practice_set_questions
       WHERE practice_set_id = $1`,
      [attempt.practice_set_id]
    );
    const maxScore = maxRes.rows?.[0]?.max_score ?? 0;
    const scoreRes = await client.query(
      `SELECT COALESCE(SUM(points_awarded), 0)::float AS score
       FROM practice_answers
       WHERE attempt_id = $1`,
      [attemptId]
    );
    const score = scoreRes.rows?.[0]?.score ?? 0;

    const up = await client.query(
      `UPDATE practice_attempts
       SET status = 'submitted', submitted_at = NOW(), score = $2, max_score = $3
       WHERE id = $1
       RETURNING *`,
      [attemptId, score, maxScore]
    );

    await client.query('COMMIT');
    return res.json({ ok: true, attempt: up.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST] Practice submit error:', err);
    return res.status(500).json({ error: 'Failed to submit practice' });
  } finally {
    client.release();
  }
});

// List domains (optionally by subject)
app.get('/api/domains', async (req, res) => {
  const subjectId = req.query.subjectId ? parseInt(req.query.subjectId) : null;
  const client = await pool.connect();
  try {
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    let sql = 'SELECT id, subject_id, key, name FROM domains';
    const params = [];
    if (subjectId) {
      sql += ' WHERE subject_id = $1';
      params.push(subjectId);
    }
    sql += ' ORDER BY id';
    const result = await client.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET] Domains error:', err);
    res.status(500).json({ error: 'Failed to fetch domains' });
  } finally {
    client.release();
  }
});

// List topics for a domain
app.get('/api/domains/:domainId/topics', async (req, res) => {
  const domainId = parseInt(req.params.domainId);
  if (!domainId) return res.status(400).json({ error: 'Missing or invalid domainId' });
  const client = await pool.connect();
  try {
    await ensureMathTaxonomyExists(client);
    await seedMathTaxonomyIfEmpty(client);
    const result = await client.query(
      'SELECT id, domain_id, key, name FROM topics WHERE domain_id = $1 ORDER BY id',
      [domainId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET] Topics error:', err);
    res.status(500).json({ error: 'Failed to fetch topics' });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const server = http.createServer(app);

attachSocketServer(server, {
  // For local/dev: allow all origins. Tighten later if needed.
  corsOrigin: '*',
  pgPool: pool,
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT=5001 (or stop the other process).`);
    process.exitCode = 1;
    return;
  }
  console.error('Server error:', err);
  process.exitCode = 1;
});
