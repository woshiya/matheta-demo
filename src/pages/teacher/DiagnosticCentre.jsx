import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import DomainRadarChart from "../../components/DomainRadarChart";
import { DIAGNOSTIC_QUESTIONS } from "../../lib/diagnosticQuestions";

function scoresListToMap(domainScores) {
  const out = {};
  for (const s of Array.isArray(domainScores) ? domainScores : []) {
    if (!s?.domain_key) continue;
    out[String(s.domain_key)] = Number(s.percent ?? 0) || 0;
  }
  return out;
}

export default function DiagnosticCentre() {
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  }, []);

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");

  const [activeSession, setActiveSession] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showResultsInfo, setShowResultsInfo] = useState(false);

  const diagnosticsDateLabel = useMemo(() => {
    const s = activeSession;
    const raw = s?.started_at || s?.created_at || s?.ends_at || null;
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
  }, [activeSession]);

  async function loadResults(classId, sessionId) {
    const rRes = await apiFetch(
      `/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/${encodeURIComponent(sessionId)}/results?teacherId=${encodeURIComponent(
        user?.id || ""
      )}`
    );
    const rData = rRes.ok ? await rRes.json() : { students: [] };
    setResults(Array.isArray(rData.students) ? rData.students : []);
  }

  useEffect(() => {
    async function loadClasses() {
      const teacherId = user?.id;
      if (!teacherId) return;
      try {
        const res = await apiFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) {
          setClasses([]);
          setError("Failed to load classes");
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
      } catch {
        setClasses([]);
        setError("Failed to load classes");
      }
    }
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Ensure we always have a valid selection when classes load.
  useEffect(() => {
    if (!selectedClassId && classes[0]?.id) setSelectedClassId(String(classes[0].id));
  }, [classes, selectedClassId]);

  async function refreshActiveAndResults(classIdStr) {
    const classId = String(classIdStr || "").trim();
    if (!classId) return;
    setError(null);
    setStatus("loading");
    try {
      const sRes = await apiFetch(`/api/classes/${encodeURIComponent(classId)}/diagnostic-sessions/active`);
      const sData = sRes.ok ? await sRes.json() : { session: null };

      // Keep showing the latest known session results even after it is closed.
      const nextSession = sData.session || activeSession || null;
      setActiveSession(nextSession);
      if (nextSession?.id) {
        await loadResults(classId, nextSession.id);
      } else {
        setResults([]);
      }
      setStatus("loaded");
    } catch (err) {
      setStatus("error");
      setError(String(err?.message || err));
    }
  }

  useEffect(() => {
    if (!selectedClassId) return;
    refreshActiveAndResults(selectedClassId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  async function startSession() {
    if (!selectedClassId) return;
    setStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(`/api/classes/${encodeURIComponent(selectedClassId)}/diagnostic-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: user?.id, durationMinutes: 45 }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setStatus("error");
        setError(t || "Failed to start diagnostic session");
        return;
      }
      await refreshActiveAndResults(selectedClassId);
    } catch (err) {
      setStatus("error");
      setError(String(err?.message || err));
    }
  }

  async function endSession() {
    if (!selectedClassId || !activeSession?.id) return;

    const endsAtMs = activeSession?.ends_at ? new Date(activeSession.ends_at).getTime() : null;
    const now = Date.now();
    const remainingMs = endsAtMs && Number.isFinite(endsAtMs) ? endsAtMs - now : null;
    if (remainingMs !== null && remainingMs > 0) {
      const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
      const ok = window.confirm(
        `45 mins are not yet over (about ${minutes} min remaining). Do you want to end the test?`
      );
      if (!ok) return;
    }

    setStatus("saving");
    setError(null);
    try {
      const res = await apiFetch(
        `/api/classes/${encodeURIComponent(selectedClassId)}/diagnostic-sessions/${encodeURIComponent(activeSession.id)}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId: user?.id }),
        }
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || "Failed to end diagnostic session");
      }
      const data = await res.json().catch(() => null);
      const closed = data?.session || null;
      if (closed) setActiveSession(closed);
      if (closed?.id) await loadResults(selectedClassId, closed.id);
      setStatus("loaded");
    } catch (err) {
      setStatus("error");
      setError(String(err?.message || err));
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Diagnostic Centre</h1>
          <p className="text-sm text-gray-600 mt-1">Start a 45-minute diagnostic session and review domain radar results.</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Class</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="text-sm font-medium text-gray-700">Session</div>
            <div className="mt-2 text-sm text-gray-900">
              {activeSession ? (
                String(activeSession.status) === "active"
                  ? `Active (ends ${new Date(activeSession.ends_at).toLocaleTimeString()})`
                  : `Ended (ended ${new Date(activeSession.ends_at).toLocaleTimeString()})`
              ) : (
                "No active session"
              )}
            </div>
          </div>

          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
            onClick={startSession}
            disabled={!selectedClassId || status === "saving" || String(activeSession?.status) === "active"}
            title={activeSession ? "A diagnostic session is already active for this class" : "Start a diagnostic session"}
          >
            {status === "saving" ? "Starting..." : "Start 45-min Diagnostic"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQuestions((v) => !v)}
            className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
          >
            {showQuestions ? "Hide Questions" : "View Questions"}
          </button>
          <button
            type="button"
            onClick={endSession}
            disabled={!activeSession}
            className="px-3 py-2 rounded-md text-sm font-medium border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            End Diagnostic
          </button>
          {activeSession ? (
            <span className="text-xs text-gray-600">
              Active session ID: <span className="font-mono">{activeSession.id}</span>
            </span>
          ) : null}
        </div>

        {showQuestions ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-semibold text-gray-900">Question Bank ({DIAGNOSTIC_QUESTIONS.length})</div>
            <div className="mt-2 space-y-2">
              {DIAGNOSTIC_QUESTIONS.map((q) => (
                <div key={q.id} className="text-sm">
                  <div className="text-gray-900">
                    <span className="font-semibold">Q{q.id}.</span> {q.question}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {q.domain} · Options: {q.options.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900">Results</div>
            <div className="flex items-center gap-3">
              {diagnosticsDateLabel ? (
                <div className="text-xs text-gray-600">
                  Diagnostic date: <span className="font-medium text-gray-800">{diagnosticsDateLabel}</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setShowResultsInfo(true)}
                className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                aria-label="About these results"
                title="About these results"
              >
                i
              </button>
            </div>
          </div>
        </div>
        {status === "loading" ? (
          <div className="p-4 text-sm text-gray-600">Loading...</div>
        ) : results.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No submissions yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {results.map((s) => (
              <div key={s.student_id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{s.student_name || `Student ${s.student_id}`}</div>
                    <div className="text-xs text-gray-600">
                      {s.attempt_status || ""}{s.submitted_at ? ` · submitted ${new Date(s.submitted_at).toLocaleString()}` : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <DomainRadarChart scoresByDomainKey={scoresListToMap(s.domain_scores)} height={320} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showResultsInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setShowResultsInfo(false)}
          />
          <div className="relative w-full max-w-xl rounded-xl bg-white border border-gray-200 shadow-lg">
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">About These Results</div>
                <div className="mt-1 text-xs text-gray-600">
                  What you see here depends on whether a backend is connected.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResultsInfo(false)}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm text-gray-800">
              <div>
                If this site is running in demo mode (static hosting), these diagnostic results are pre-populated sample data for each class so you can showcase the dashboard and radar charts.
              </div>
              <div>
                If you connect a real backend later (set `VITE_API_BASE_URL`), results will come from real student attempts and submissions.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
