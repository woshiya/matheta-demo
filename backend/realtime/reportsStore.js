// In-memory session reports.
//
// Notes:
// - Resets on server restart.
// - Keeps ended session reports so teacher can view later.

const reports = Object.create(null); // sessionId -> report

function saveReport(report) {
  if (!report || !report.sessionId) throw new Error('Missing report.sessionId');
  reports[String(report.sessionId)] = report;
  return report;
}

function getReport(sessionId) {
  return reports[String(sessionId)] || null;
}

function listReports({ teacherId } = {}) {
  const tid = teacherId !== undefined && teacherId !== null ? String(teacherId) : null;
  const all = Object.values(reports);
  const filtered = tid ? all.filter((r) => String(r.teacherId || '') === tid) : all;
  return filtered
    .slice()
    .sort((a, b) => (b.endedAtMs || 0) - (a.endedAtMs || 0));
}

module.exports = {
  saveReport,
  getReport,
  listReports,
};
