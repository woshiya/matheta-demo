// DB persistence for live session reports.
// Stores the full report payload as JSONB.

async function ensureLiveSessionReportsTable(clientOrPool) {
  await clientOrPool.query(
    `CREATE TABLE IF NOT EXISTS live_session_reports (
      session_id TEXT PRIMARY KEY,
      teacher_id INTEGER,
      class_id INTEGER,
      assignment_id INTEGER,
      assignment_title TEXT,
      report_name TEXT,
      started_at TIMESTAMP,
      ended_at TIMESTAMP,
      report JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`
  );

  // Backfill / upgrade older tables.
  await clientOrPool.query(
    "ALTER TABLE live_session_reports ADD COLUMN IF NOT EXISTS report_name TEXT;"
  );
  await clientOrPool.query(
    `CREATE INDEX IF NOT EXISTS live_session_reports_teacher_ended_idx
     ON live_session_reports(teacher_id, ended_at DESC);`
  );
}

function toIntOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

async function saveReport(pool, report) {
  await ensureLiveSessionReportsTable(pool);

  const sessionId = String(report.sessionId);
  const teacherId = toIntOrNull(report.teacherId);
  const classId = toIntOrNull(report.classId);
  const assignmentId = toIntOrNull(report.assignmentId);
  const assignmentTitle = report.assignmentTitle ? String(report.assignmentTitle) : null;
  const reportName = report.reportName ? String(report.reportName) : null;
  const startedAt = report.startedAt ? new Date(report.startedAt) : null;
  const endedAt = report.endedAt ? new Date(report.endedAt) : null;

  await pool.query(
    `INSERT INTO live_session_reports
      (session_id, teacher_id, class_id, assignment_id, assignment_title, report_name, started_at, ended_at, report)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (session_id) DO UPDATE
       SET teacher_id = EXCLUDED.teacher_id,
           class_id = EXCLUDED.class_id,
           assignment_id = EXCLUDED.assignment_id,
           assignment_title = EXCLUDED.assignment_title,
           report_name = EXCLUDED.report_name,
           started_at = EXCLUDED.started_at,
           ended_at = EXCLUDED.ended_at,
           report = EXCLUDED.report`,
    [
      sessionId,
      teacherId,
      classId,
      assignmentId,
      assignmentTitle,
      reportName,
      startedAt,
      endedAt,
      JSON.stringify(report),
    ]
  );
}

async function listReports(pool, { teacherId } = {}) {
  await ensureLiveSessionReportsTable(pool);
  const tid = toIntOrNull(teacherId);

  const r = tid
    ? await pool.query(
        `SELECT session_id, teacher_id, class_id, assignment_id, assignment_title, report_name, started_at, ended_at, report
         FROM live_session_reports
         WHERE teacher_id = $1
         ORDER BY ended_at DESC NULLS LAST
         LIMIT 50`,
        [tid]
      )
    : await pool.query(
        `SELECT session_id, teacher_id, class_id, assignment_id, assignment_title, report_name, started_at, ended_at, report
         FROM live_session_reports
         ORDER BY ended_at DESC NULLS LAST
         LIMIT 50`
      );

  return (r.rows || []).map((row) => {
    const report = row.report || {};
    return {
      sessionId: row.session_id,
      teacherId: row.teacher_id,
      classId: row.class_id,
      assignmentId: row.assignment_id,
      assignmentTitle: row.assignment_title,
      reportName: row.report_name || report.reportName || null,
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : report.startedAt || null,
      endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : report.endedAt || null,
      summary: report.summary || null,
    };
  });
}

async function getReport(pool, sessionId) {
  await ensureLiveSessionReportsTable(pool);
  const id = String(sessionId);
  const r = await pool.query(
    `SELECT report
     FROM live_session_reports
     WHERE session_id = $1`,
    [id]
  );
  if (!r.rows.length) return null;
  return r.rows[0].report || null;
}

module.exports = {
  ensureLiveSessionReportsTable,
  saveReport,
  listReports,
  getReport,
};
