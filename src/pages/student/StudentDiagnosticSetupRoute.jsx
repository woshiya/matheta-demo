import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { apiFetch } from "../../lib/api";

export default function StudentDiagnosticSetupRoute() {
  const navigate = useNavigate();
  const { classes } = useOutletContext() || { classes: [] };

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  }, []);

  const [selectedClassId, setSelectedClassId] = useState("");
  const [activeSession, setActiveSession] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedClassId && classes?.[0]?.id) {
      setSelectedClassId(String(classes[0].id));
    }
  }, [classes, selectedClassId]);

  useEffect(() => {
    async function loadActive() {
      if (!selectedClassId) return;
      setStatus("loading");
      setError(null);
      try {
        const res = await apiFetch(
          `/api/classes/${encodeURIComponent(selectedClassId)}/diagnostic-sessions/active`
        );
        const data = res.ok ? await res.json() : { session: null };
        setActiveSession(data.session || null);
        setStatus("loaded");
      } catch (err) {
        setStatus("error");
        setError(String(err?.message || err));
      }
    }
    loadActive();
  }, [selectedClassId]);

  async function start() {
    if (!user?.id || !selectedClassId) return;
    setStatus("saving");
    setError(null);

    // Re-check active session at click time to avoid stale UI
    // (teacher may have ended/restarted the session since last refresh).
    let sessionToUse = activeSession;
    try {
      const sRes = await apiFetch(
        `/api/classes/${encodeURIComponent(selectedClassId)}/diagnostic-sessions/active`
      );
      const sData = sRes.ok ? await sRes.json() : { session: null };
      sessionToUse = sData.session || null;
      setActiveSession(sessionToUse);
    } catch {
      // If this fails, we still try with the last-known session.
    }

    if (!sessionToUse?.id) {
      setStatus("error");
      setError("No active session for this class. Ask your teacher to start one.");
      return;
    }
    try {
      // Ensure attempt exists (also enforces class membership + active session)
      const aRes = await apiFetch(
        `/api/classes/${encodeURIComponent(selectedClassId)}/diagnostic-sessions/${encodeURIComponent(
          sessionToUse.id
        )}/attempts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: user.id }),
        }
      );
      if (!aRes.ok) {
        const ct = aRes.headers.get("content-type") || "";
        const msg = ct.includes("application/json")
          ? (await aRes.json().catch(() => null))?.error
          : await aRes.text().catch(() => "");
        throw new Error(msg || "Failed to start diagnostic");
      }
      navigate(
        `/student/diagnostic/${encodeURIComponent(selectedClassId)}/${encodeURIComponent(
          sessionToUse.id
        )}`
      );
    } catch (err) {
      setStatus("error");
      setError(String(err?.message || err));
    }
  }

  return (
    <div className="max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-gray-900">Diagnostic Test</h1>
      <p className="text-sm text-gray-600 mt-1">
        Your teacher must start a diagnostic session for your class.
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Class</span>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="mt-2 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            {(classes || []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 text-sm text-gray-900">
          {status === "loading" ? (
            "Checking for an active session..."
          ) : activeSession ? (
            <span>
              Active session available (ends {new Date(activeSession.ends_at).toLocaleTimeString()})
            </span>
          ) : (
            "No active session for this class."
          )}
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!activeSession || status === "saving"}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
          >
            {status === "saving" ? "Starting..." : "Start Diagnostic"}
          </button>
          <button
            type="button"
            onClick={() => navigate(0)}
            className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
