import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { httpFetch } from '../../lib/http';

function formatSeconds(n) {
  if (n === null || n === undefined) return '-';
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';
  if (num < 60) return `${Math.round(num)}s`;
  const m = Math.floor(num / 60);
  const s = Math.round(num % 60);
  return `${m}m ${s}s`;
}

function studentLabel(studentIndex, id) {
  const key = String(id);
  const s = studentIndex[key];
  const name = s?.name ? String(s.name) : null;
  return name || null;
}

export default function LiveSessionReport() {
  const { sessionId } = useParams();
  const [status, setStatus] = useState({ loading: true, error: null });
  const [report, setReport] = useState(null);

  const teacherId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.id ? String(user.id) : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) {
        setStatus({ loading: false, error: 'Missing sessionId' });
        return;
      }

      setStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(`/api/realtime/reports/${encodeURIComponent(String(sessionId))}`);
        if (!res.ok) throw new Error('Failed to load report');
        const data = await res.json();
        if (cancelled) return;
        setReport(data || null);
        setStatus({ loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setReport(null);
        setStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const endedAt = report?.endedAt ? new Date(report.endedAt).toLocaleString() : null;
  const startedAt = report?.startedAt ? new Date(report.startedAt).toLocaleString() : null;

  const studentIndex = useMemo(() => {
    const out = Object.create(null);
    for (const s of report?.students || []) {
      if (!s?.studentId) continue;
      out[String(s.studentId)] = s;
    }
    return out;
  }, [report]);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Session Report</h1>
          <p className="text-sm text-gray-600 mt-1">Session: <span className="font-mono">{String(sessionId || '')}</span></p>
        </div>
        <Link
          to="/teacher/live"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
        >
          Back
        </Link>
      </div>

      {status.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.error}
        </div>
      ) : null}

      {status.loading ? (
        <div className="text-sm text-gray-600">Loading report...</div>
      ) : !report ? (
        <div className="text-sm text-gray-600">Report not found.</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">
              {report.assignmentTitle || `Assignment ${report.assignmentId || ''}`}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Teacher: {teacherId ? teacherId : '-'}
            </div>
            <div className="mt-1 text-xs text-gray-600">Started: {startedAt || '-'}</div>
            <div className="mt-1 text-xs text-gray-600">Ended: {endedAt || '-'}</div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-700">
              <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">
                Active: {report.summary?.activeStudents ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">
                Raised: {report.summary?.raisedHandCount ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">
                Struggling: {report.summary?.strugglingCount ?? 0}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">
                Inactive: {report.summary?.inactiveCount ?? 0}
              </span>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">Summary</div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500">Active Students</div>
                <div className="text-lg font-semibold text-gray-900">{report.summary?.activeStudents ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500">Raised Hands (Open)</div>
                <div className="text-lg font-semibold text-gray-900">{report.summary?.raisedHandCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500">Struggling</div>
                <div className="text-lg font-semibold text-gray-900">{report.summary?.strugglingCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs text-gray-500">Inactive</div>
                <div className="text-lg font-semibold text-gray-900">{report.summary?.inactiveCount ?? 0}</div>
              </div>
            </div>

            {(report.summary?.lowAccuracyQuestions || []).length ? (
              <div className="mt-5">
                <div className="text-sm font-semibold text-gray-900">Low Accuracy Questions</div>
                <div className="mt-2 space-y-2">
                  {(report.summary?.lowAccuracyQuestions || []).map((q) => (
                    <div key={q.questionId} className="flex items-center justify-between text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="text-gray-900">Question {q.questionId}</div>
                      <div className="font-medium text-amber-800">{q.accuracy}% accuracy</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-gray-900">Per Question Breakdown</div>
            <div className="mt-3 space-y-3">
              {(report.perQuestion || []).length === 0 ? (
                <div className="text-sm text-gray-600">No per-question data recorded.</div>
              ) : (
                (report.perQuestion || []).map((q) => {
                  const openIds = Array.isArray(q.raisedHandStudentIds) ? q.raisedHandStudentIds : [];
                  const historyIdsRaw = Array.isArray(q.raisedHandHistoryStudentIds) ? q.raisedHandHistoryStudentIds : [];
                  // Back-compat: older stored reports may not include history ids.
                  const anyIds = historyIdsRaw.length ? historyIdsRaw : openIds;

                  const openHands = openIds.map((id) => studentLabel(studentIndex, id)).filter(Boolean);
                  const anyHands = anyIds.map((id) => studentLabel(studentIndex, id)).filter(Boolean);
                  const difficultBy = (q.difficultMarkStudentIds || []).map((id) => studentLabel(studentIndex, id)).filter(Boolean);
                  const slowBy = (q.slowStudentIds || []).map((id) => studentLabel(studentIndex, id)).filter(Boolean);

                  return (
                    <div key={q.questionId} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Question {q.questionId}</div>
                          {q.text ? (
                            <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap">{q.text}</div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Accuracy</div>
                          <div className="text-lg font-semibold text-gray-900">{q.accuracy ?? 0}%</div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Attempts</div>
                          <div className="font-semibold text-gray-900">{q.attempts ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Correct</div>
                          <div className="font-semibold text-gray-900">{q.correct ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Incorrect</div>
                          <div className="font-semibold text-gray-900">{q.wrong ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Hands (Open)</div>
                          <div className="font-semibold text-gray-900">{q.raisedHands ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Marked Difficult</div>
                          <div className="font-semibold text-gray-900">{q.difficultMarks ?? 0}</div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                          <div className="text-gray-500">Slow (&gt;60s)</div>
                          <div className="font-semibold text-gray-900">{q.slowCount ?? 0}</div>
                        </div>
                      </div>

                      <div className="mt-3 grid md:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="text-gray-500">Solve Time</div>
                          <div className="mt-1 text-gray-800">
                            Min: {formatSeconds(q.solveTime?.minSeconds)}
                          </div>
                          <div className="mt-1 text-gray-800">
                            Mean: {formatSeconds(q.solveTime?.meanSeconds)}
                          </div>
                          <div className="mt-1 text-gray-800">
                            Max: {formatSeconds(q.solveTime?.maxSeconds)}
                          </div>
                          <div className="mt-1 text-gray-500">Samples: {q.solveTime?.count ?? 0}</div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="text-gray-500">Raised Hands (Any)</div>
                          {anyHands.length ? (
                            <div className="mt-1 text-gray-800">{anyHands.join(', ')}</div>
                          ) : (q.raisedHands ?? 0) > 0 ? (
                            <div className="mt-1 text-gray-700">{q.raisedHands} student(s) (legacy report)</div>
                          ) : (
                            <div className="mt-1 text-gray-500">None</div>
                          )}
                          <div className="mt-3 text-gray-500">Raised Hands (Open)</div>
                          {openHands.length ? (
                            <div className="mt-1 text-gray-800">{openHands.join(', ')}</div>
                          ) : (q.raisedHands ?? 0) > 0 ? (
                            <div className="mt-1 text-gray-700">{q.raisedHands} student(s) (legacy report)</div>
                          ) : (
                            <div className="mt-1 text-gray-500">None</div>
                          )}
                        </div>

                        <div className="rounded-lg border border-gray-200 p-3">
                          <div className="text-gray-500">Marked Difficult By</div>
                          {difficultBy.length ? (
                            <div className="mt-1 text-gray-800">{difficultBy.join(', ')}</div>
                          ) : (
                            <div className="mt-1 text-gray-500">None</div>
                          )}

                          <div className="mt-3 text-gray-500">Slow Students (&gt;60s)</div>
                          {slowBy.length ? (
                            <div className="mt-1 text-gray-800">{slowBy.join(', ')}</div>
                          ) : (
                            <div className="mt-1 text-gray-500">None</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
