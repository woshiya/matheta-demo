import { useEffect, useMemo, useState } from "react";
import { httpFetch } from "../../lib/http";
import DomainRadarChart from "../../components/DomainRadarChart";

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(value) {
  const d = safeDate(value);
  if (!d) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badge(label, tone) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border";
  const color =
    tone === "blue"
      ? " bg-blue-50 text-blue-700 border-blue-200"
      : tone === "green"
        ? " bg-emerald-50 text-emerald-700 border-emerald-200"
        : tone === "amber"
          ? " bg-amber-50 text-amber-700 border-amber-200"
          : " bg-gray-100 text-gray-700 border-gray-200";
  return <span className={base + color}>{label}</span>;
}

export default function StudentClassAssignments({ classId, classLabel, classObj, onOpenAssignment }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [radar, setRadar] = useState(null);
  const [radarStatus, setRadarStatus] = useState({ loading: false, error: null });

  const studentId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      return u?.id || null;
    } catch {
      return null;
    }
  }, []);

  const isDemoStudentOne = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      return String(u?.email || "").toLowerCase() === "student1@demo.com";
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    async function loadRadar() {
      if (!classId || !studentId) return;
      setRadarStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(
          `/api/classes/${encodeURIComponent(String(classId))}/students/${encodeURIComponent(String(studentId))}/domain-radar`
        );
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Failed to load radar");
        }
        const json = await res.json();
        setRadar(json);
        setRadarStatus({ loading: false, error: null });
      } catch (err) {
        setRadar(null);
        setRadarStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    loadRadar();
  }, [classId, studentId]);

  const baselineMap = useMemo(() => {
    const list = radar?.baseline?.domainScores;
    const map = Object.create(null);
    if (!Array.isArray(list)) return map;
    for (const r of list) {
      if (!r?.domain_key) continue;
      map[String(r.domain_key)] = Number(r.percent ?? 0);
    }
    return map;
  }, [radar?.baseline?.domainScores]);

  const currentMap = useMemo(() => {
    const list = radar?.current?.domainScores;
    const map = Object.create(null);
    if (!Array.isArray(list)) return map;
    for (const r of list) {
      if (!r?.domain_key) continue;
      map[String(r.domain_key)] = Number(r.percent ?? 0);
    }
    return map;
  }, [radar?.current?.domainScores]);

  const demoBoostedCurrentMap = useMemo(() => {
    if (!isDemoStudentOne) return currentMap;

    // Demo-only: show visible improvement without changing stored baseline/attempt data.
    // Boost selected domains relative to the student's baseline so the "Current" polygon
    // clearly improves vs "Initial" in demos.
    const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
    const bump = {
      // Make the demo visually show growth and some regression.
      number: -10,
      algebra: -8,
      measures: -6,
      shape_space: 10,
      data_handling: 20,
    };

    const baseNumber = baselineMap.number ?? currentMap.number ?? 0;
    const baseAlgebra = baselineMap.algebra ?? currentMap.algebra ?? 0;
    const baseMeasures = baselineMap.measures ?? currentMap.measures ?? 0;
    const baseShape = baselineMap.shape_space ?? currentMap.shape_space ?? 0;
    const baseData = baselineMap.data_handling ?? currentMap.data_handling ?? 0;
    return {
      ...currentMap,
      number: clamp(baseNumber + bump.number),
      algebra: clamp(baseAlgebra + bump.algebra),
      measures: clamp(baseMeasures + bump.measures),
      shape_space: clamp(baseShape + bump.shape_space),
      data_handling: clamp(baseData + bump.data_handling),
    };
  }, [baselineMap, currentMap, isDemoStudentOne]);

  useEffect(() => {
    async function load() {
      if (!classId) return;
      if (!studentId) {
        setStatus("error");
        setError("Missing student login.");
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const nowAtFetchMs = Date.now();
        const res = await httpFetch(`/api/students/${studentId}/classes/${classId}/assignments`);
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          setStatus("error");
          if (res.status === 404) {
            setError("Backend endpoint for student class assignments is missing (404). Restart the backend server.");
          } else {
            setError(t || "Failed to load assignments.");
          }
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        // Backend already filters out drafts and checks enrollment.
        const withComputed = list.map((a) => {
          const due = safeDate(a?.due_at);
          const dueMs = due ? due.getTime() : null;
          // Time-based split is computed once at fetch time.
          const isUpcoming = dueMs !== null ? dueMs > nowAtFetchMs : false;
          return { ...a, __isUpcoming: isUpcoming };
        });
        setAssignments(withComputed);
        setStatus("loaded");
      } catch {
        setStatus("error");
        setError("Failed to load assignments.");
      }
    }
    load();
  }, [classId, studentId]);

  const { upcoming, past } = useMemo(() => {
    const list = (assignments || []).map((a) => {
      const due = safeDate(a?.due_at);
      const dueMs = due ? due.getTime() : null;
      const isUpcoming = Boolean(a?.__isUpcoming);
      return { a, dueMs, isUpcoming };
    });

    const upcoming = list
      .filter((x) => x.isUpcoming)
      .sort((l, r) => (l.dueMs ?? 0) - (r.dueMs ?? 0))
      .map((x) => x.a);

    const past = list
      .filter((x) => !x.isUpcoming)
      .sort((l, r) => {
        // Prefer most recent due date, then created_at.
        const d = (r.dueMs ?? 0) - (l.dueMs ?? 0);
        if (d !== 0) return d;
        const lc = safeDate(l.a?.created_at)?.getTime() ?? 0;
        const rc = safeDate(r.a?.created_at)?.getTime() ?? 0;
        return rc - lc;
      })
      .map((x) => x.a);

    return { upcoming, past };
  }, [assignments]);

  function actionLabelFor(a) {
    // Future backend can attach: my_submission_status: not_started|in_progress|submitted|graded
    const s = String(a?.my_submission_status || "");
    if (s === "submitted" || s === "graded") return "View assignment";

    // Fallback (frontend-only): use the fetch-time split.
    if (a?.__isUpcoming) return "Do assignment";
    if (a?.due_at) return "View assignment";
    return "Do assignment";
  }

  function performanceText(a) {
    const s = String(a?.my_submission_status || "");
    const score = a?.my_score;
    const max = a?.my_max_score;
    if (s === "graded" && score !== undefined && score !== null) {
      const denom = max !== undefined && max !== null ? ` / ${max}` : "";
      return `Score: ${score}${denom}`;
    }
    if (s === "submitted") return "Submitted (not marked yet)";
    if (s === "in_progress") return "In progress";
    if (s === "not_started") return "Not started";
    return "Performance: not available yet";
  }

  function markedBadge(a) {
    const s = String(a?.my_submission_status || "");
    if (s === "graded") return badge("Marked", "green");
    if (s === "submitted") return badge("Submitted", "blue");
    return badge("Not submitted", "gray");
  }

  function renderRow(a) {
    const type = String(a?.type || "").toUpperCase();
    const status = String(a?.status || "");

    return (
      <div
        key={a.id}
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-gray-900 break-words">{a.title}</h3>
            {type ? badge(type, "gray") : null}
            {status ? badge(status, status === "published" ? "green" : "gray") : null}
            {markedBadge(a)}
          </div>
          {a.description ? (
            <p className="text-sm text-gray-600 mt-1 break-words">{a.description}</p>
          ) : null}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
            <div>
              <span className="text-gray-500">Due:</span> {a.due_at ? fmtDateTime(a.due_at) : "No due date"}
            </div>
            <div>
              <span className="text-gray-500">Questions:</span> {Number(a.question_count ?? 0)}
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">Your performance:</span> {performanceText(a)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              const label = actionLabelFor(a);
              const mode = label === "View assignment" ? "view" : "do";
              onOpenAssignment?.(a, mode);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition"
          >
            {actionLabelFor(a)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-5xl">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{classLabel || "My Class"}</h1>
              <p className="text-sm text-gray-600 mt-1">All assignments for this class.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Domain Radar</div>
              <div className="text-xs text-gray-500 mt-1">
                Baseline is your last diagnostic. Current updates after each submitted/graded assignment.
              </div>
            </div>
            {classObj?.name ? (
              <div className="text-xs text-gray-500">{classObj.name}</div>
            ) : null}
          </div>

          {radarStatus.loading ? (
            <div className="mt-3 text-sm text-gray-600">Loading radar...</div>
          ) : radarStatus.error ? (
            <div className="mt-3 text-sm text-red-600">{radarStatus.error}</div>
          ) : !radar?.baseline ? (
            <div className="mt-3 text-sm text-gray-600">No baseline diagnostic yet.</div>
          ) : (
            <div className="mt-4 grid md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">Initial (last diagnostic)</div>
                <div className="text-sm text-gray-600 mt-1">
                  {fmtDateTime(radar?.baseline?.submittedAt)}
                </div>
                <div className="mt-3">
                  <DomainRadarChart scoresByDomainKey={baselineMap} height={320} />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">Current (since last diagnostic)</div>
                <div className="text-sm text-gray-600 mt-1">
                  {radar?.current?.since ? `Since ${fmtDateTime(radar.current.since)}` : "Updates automatically."}
                </div>
                {isDemoStudentOne ? (
                  <div className="mt-2">
                    {badge(
                      "Demo: vs Initial (+10 Shape & Space, +20 Data Handling, -10 Number, -8 Algebra, -6 Measures)",
                      "amber"
                    )}
                  </div>
                ) : null}
                <div className="mt-3">
                  <DomainRadarChart scoresByDomainKey={demoBoostedCurrentMap} height={320} />
                </div>
              </div>
            </div>
          )}
        </div>

        {status === "loading" ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">Loading assignments...</div>
        ) : status === "error" ? (
          <div className="bg-white rounded-xl border border-red-200 p-6 text-red-700">{error || "Failed to load."}</div>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Upcoming</h2>
                <span className="text-sm text-gray-500">{upcoming.length}</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">No upcoming assignments.</div>
              ) : (
                <div className="space-y-3">{upcoming.map(renderRow)}</div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Past</h2>
                <span className="text-sm text-gray-500">{past.length}</span>
              </div>
              {past.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-700">No past assignments.</div>
              ) : (
                <div className="space-y-3">{past.map(renderRow)}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
