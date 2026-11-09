import React, { useState, useEffect, useMemo } from "react";
import WidgetCustomizer from "./WidgetCustomizer.jsx";
import { useParams } from "react-router-dom";
import { httpFetch } from "../../lib/http";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import DomainRadarChart from "../../components/DomainRadarChart";

function riskBadge(label) {
  const l = String(label || 'insufficient_data');
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border';
  if (l === 'high_risk') return <span className={base + ' bg-red-50 text-red-700 border-red-200'}>High Risk</span>;
  if (l === 'developing') return <span className={base + ' bg-amber-50 text-amber-800 border-amber-200'}>Developing</span>;
  if (l === 'mastery') return <span className={base + ' bg-emerald-50 text-emerald-700 border-emerald-200'}>Mastery</span>;
  return <span className={base + ' bg-gray-100 text-gray-700 border-gray-200'}>Insufficient data</span>;
}

function domainKeyToLabel(k) {
  const key = String(k || "");
  if (key === "number") return "Number";
  if (key === "algebra") return "Algebra";
  if (key === "measures") return "Measures";
  if (key === "shape_space") return "Shape & Space";
  if (key === "data_handling") return "Data Handling";
  return key;
}

function tierLabel(tier) {
  if (tier === 1) return "Tier 1";
  if (tier === 2) return "Tier 2";
  if (tier === 3) return "Tier 3";
  return `Tier ${tier}`;
}

/* ---------------- MOCK DATA ---------------- */



const performanceData = [
  { date: "Mon", score: 72 },
  { date: "Tue", score: 62 },
  { date: "Wed", score: 85 },
];

/* ---------------- COMPONENT ---------------- */

function ClassDetail() {
  const { id } = useParams();

  const [membershipReady, setMembershipReady] = useState(false);

  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [analyticsByStudentId, setAnalyticsByStudentId] = useState({});
  const [radarStatus, setRadarStatus] = useState({ loading: false, error: null });
  const [radarData, setRadarData] = useState(null);

  const [thresholds, setThresholds] = useState({ highRisk: 50, mastery: 70 });
  const [thresholdStatus, setThresholdStatus] = useState({ loading: false, saving: false, error: null });
  const [riskData, setRiskData] = useState(null);
  const [riskStatus, setRiskStatus] = useState({ loading: false, error: null });
  const [adaptiveData, setAdaptiveData] = useState(null);
  const [adaptiveStatus, setAdaptiveStatus] = useState({ loading: false, error: null });

  const [overrideDraft, setOverrideDraft] = useState(null); // { scope, domainKey?, systemLabel }
  const [overrideLabel, setOverrideLabel] = useState('developing');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideStatus, setOverrideStatus] = useState({ saving: false, error: null });

  const [radarView, setRadarView] = useState('current'); // current | baseline
  const [showAllAdaptive, setShowAllAdaptive] = useState(false);

  const teacherId = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user"))?.id || null;
    } catch {
      return null;
    }
  }, []);

  const isDemoStudentOne = useMemo(() => {
    const email = String(selectedStudent?.email || "").toLowerCase();
    return email === "student1@demo.com";
  }, [selectedStudent?.email]);

  const isDemoTeacher = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      return String(u?.email || "").endsWith("@demo.com") && String(u?.role || "").toLowerCase() === "teacher";
    } catch {
      return false;
    }
  }, []);

  // Demo: make sure the teacher is assigned to classes before loading gated endpoints.
  useEffect(() => {
    let cancelled = false;
    async function ensureMembership() {
      if (!teacherId) {
        if (!cancelled) setMembershipReady(true);
        return;
      }
      if (!isDemoTeacher) {
        if (!cancelled) setMembershipReady(true);
        return;
      }

      try {
        await httpFetch(`/api/assign-teacher-all-classes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        });
      } catch {
        // ignore
      } finally {
        if (!cancelled) setMembershipReady(true);
      }
    }
    setMembershipReady(false);
    ensureMembership();
    return () => {
      cancelled = true;
    };
  }, [teacherId, isDemoTeacher]);

  useEffect(() => {
    async function fetchClass() {
      setSelectedClass(null);
      setSelectedStudent(null);
      const res = await httpFetch(`/api/classes/${id}`);
      if (!res.ok) return;
      const classData = await res.json();
      setSelectedClass(classData);
      if (classData.students && classData.students.length > 0) setSelectedStudent(classData.students[0]);
    }
    fetchClass();
  }, [id]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await httpFetch(`/api/classes/${id}/student-analytics`);
        if (!res.ok) {
          setAnalyticsByStudentId({});
          return;
        }
        const data = await res.json();
        const map = {};
        for (const s of data?.students || []) {
          map[String(s.student_id)] = s;
        }
        setAnalyticsByStudentId(map);
      } catch {
        setAnalyticsByStudentId({});
      }
    }
    fetchAnalytics();
  }, [id]);

  useEffect(() => {
    async function loadRadar() {
      const sid = selectedStudent?.id;
      if (!sid || !teacherId || !membershipReady) {
        setRadarData(null);
        return;
      }
      setRadarStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(
          `/api/classes/${encodeURIComponent(String(id))}/students/${encodeURIComponent(String(sid))}/domain-radar?teacherId=${encodeURIComponent(String(teacherId))}`
        );
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || "Failed to load radar");
        }
        const json = await res.json();
        setRadarData(json);
        setRadarStatus({ loading: false, error: null });
      } catch (err) {
        setRadarData(null);
        setRadarStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    loadRadar();
  }, [id, selectedStudent?.id, teacherId, membershipReady]);

  useEffect(() => {
    async function loadThresholds() {
      if (!teacherId || !membershipReady) return;
      setThresholdStatus((p) => ({ ...p, loading: true, error: null }));
      try {
        const res = await httpFetch(`/api/classes/${encodeURIComponent(String(id))}/thresholds`);
        if (!res.ok) throw new Error('Failed to load thresholds');
        const json = await res.json();
        setThresholds({
          highRisk: Number(json.high_risk_threshold ?? 50),
          mastery: Number(json.mastery_threshold ?? 70),
        });
        setThresholdStatus((p) => ({ ...p, loading: false }));
      } catch (err) {
        setThresholdStatus((p) => ({ ...p, loading: false, error: String(err?.message || err) }));
      }
    }
    loadThresholds();
  }, [id, teacherId, membershipReady]);

  useEffect(() => {
    async function loadRisk() {
      if (!teacherId || !membershipReady) return;
      setRiskStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(
          `/api/classes/${encodeURIComponent(String(id))}/risk?teacherId=${encodeURIComponent(String(teacherId))}`
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || 'Failed to load risk');
        }
        const json = await res.json();
        setRiskData(json);
        setRiskStatus({ loading: false, error: null });
      } catch (err) {
        setRiskData(null);
        setRiskStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    loadRisk();
  }, [id, teacherId, membershipReady]);

  useEffect(() => {
    async function loadAdaptive() {
      const sid = selectedStudent?.id;
      if (!sid || !teacherId || !membershipReady) {
        setAdaptiveData(null);
        return;
      }
      setAdaptiveStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(
          `/api/classes/${encodeURIComponent(String(id))}/students/${encodeURIComponent(String(sid))}/adaptive-difficulty?teacherId=${encodeURIComponent(
            String(teacherId)
          )}`
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(t || 'Failed to load adaptive difficulty');
        }
        const json = await res.json();
        setAdaptiveData(json);
        setAdaptiveStatus({ loading: false, error: null });
      } catch (err) {
        setAdaptiveData(null);
        setAdaptiveStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    loadAdaptive();
  }, [id, selectedStudent?.id, teacherId, membershipReady]);

  const selectedRisk = useMemo(() => {
    const sid = selectedStudent?.id;
    if (!sid) return null;
    const list = Array.isArray(riskData?.students) ? riskData.students : [];
    return list.find((x) => String(x.student_id) === String(sid)) || null;
  }, [riskData, selectedStudent]);

  async function saveThresholds() {
    if (!teacherId) return;
    setThresholdStatus((p) => ({ ...p, saving: true, error: null }));
    try {
      const res = await httpFetch(`/api/classes/${encodeURIComponent(String(id))}/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId,
          highRiskThreshold: thresholds.highRisk,
          masteryThreshold: thresholds.mastery,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || 'Failed to save thresholds');
      }
      await res.json();
      setThresholdStatus((p) => ({ ...p, saving: false }));

      // Reload risk to reflect new thresholds.
      const rRes = await httpFetch(
        `/api/classes/${encodeURIComponent(String(id))}/risk?teacherId=${encodeURIComponent(String(teacherId))}`
      );
      if (rRes.ok) setRiskData(await rRes.json());
    } catch (err) {
      setThresholdStatus((p) => ({ ...p, saving: false, error: String(err?.message || err) }));
    }
  }

  async function submitOverride() {
    if (!teacherId || !overrideDraft) return;
    setOverrideStatus({ saving: true, error: null });
    try {
      const res = await httpFetch(`/api/classes/${encodeURIComponent(String(id))}/risk-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId,
          studentId: selectedStudent?.id,
          scope: overrideDraft.scope,
          domainKey: overrideDraft.domainKey,
          systemLabel: overrideDraft.systemLabel,
          overrideLabel,
          reason: overrideReason,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(t || 'Failed to save override');
      }

      setOverrideDraft(null);
      setOverrideReason('');
      setOverrideLabel('developing');
      setOverrideStatus({ saving: false, error: null });

      // Refresh risk data.
      const rRes = await httpFetch(
        `/api/classes/${encodeURIComponent(String(id))}/risk?teacherId=${encodeURIComponent(String(teacherId))}`
      );
      if (rRes.ok) setRiskData(await rRes.json());
    } catch (err) {
      setOverrideStatus({ saving: false, error: String(err?.message || err) });
    }
  }

  const baselineMap = useMemo(() => {
    const list = radarData?.baseline?.domainScores;
    const map = Object.create(null);
    if (!Array.isArray(list)) return map;
    for (const r of list) {
      if (!r?.domain_key) continue;
      map[String(r.domain_key)] = Number(r.percent ?? 0);
    }
    return map;
  }, [radarData?.baseline?.domainScores]);

  const currentMap = useMemo(() => {
    const list = radarData?.current?.domainScores;
    const map = Object.create(null);
    if (!Array.isArray(list)) return map;
    for (const r of list) {
      if (!r?.domain_key) continue;
      map[String(r.domain_key)] = Number(r.percent ?? 0);
    }
    return map;
  }, [radarData?.current?.domainScores]);

  const demoBoostedCurrentMap = useMemo(() => {
    if (!isDemoStudentOne) return currentMap;

    // Demo-only: show visible improvement without changing stored baseline/attempt data.
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

  const adaptiveSorted = useMemo(() => {
    const list = Array.isArray(adaptiveData?.topics) ? adaptiveData.topics : [];
    return [...list].sort((a, b) => {
      const ta = Number(a.tier ?? 2);
      const tb = Number(b.tier ?? 2);
      if (ta !== tb) return ta - tb; // Tier 1 first
      const aa = Number(a.accuracy ?? 0);
      const ab = Number(b.accuracy ?? 0);
      if (aa !== ab) return aa - ab;
      return String(a.topic_name || '').localeCompare(String(b.topic_name || ''));
    });
  }, [adaptiveData]);

  const adaptiveCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const t of adaptiveSorted) {
      const tier = Number(t.tier);
      if (tier === 1 || tier === 2 || tier === 3) counts[tier] += 1;
    }
    return counts;
  }, [adaptiveSorted]);

  const classAverage = useMemo(() => {
    if (!selectedClass?.students || selectedClass.students.length === 0) return 0;
    return selectedClass.students.reduce((sum, s) => sum + (Number(s.progress) || 0), 0) / selectedClass.students.length;
  }, [selectedClass]);

  const selectedAnalytics = useMemo(() => {
    const sid = selectedStudent?.id;
    if (!sid) return null;
    return analyticsByStudentId[String(sid)] || null;
  }, [analyticsByStudentId, selectedStudent]);

  const areasOfConcern = useMemo(() => {
    const list = selectedAnalytics?.topic_scores;
    if (!Array.isArray(list) || list.length === 0) return [];
    return [...list]
      .filter((x) => x.topic_name)
      .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
      .slice(0, 3);
  }, [selectedAnalytics]);


  if (!selectedClass || !selectedStudent) {
    return <div className="p-6">Loading...</div>;
  }

  

  /* ---------- Insight Render ---------- */

  const renderInsight = (widget) => {
    switch (widget.type) {
      case "trend":
        return (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-base font-semibold mb-3">
              Learning Trend
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={performanceData}>
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis hide />
                <Tooltip />
                <Bar
                  dataKey="score"
                  fill="#64748b"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case "comparison":
        return (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-base font-semibold mb-3">
              Class Comparison
            </h3>
            <p className="text-sm text-gray-600">
              Class Average: {classAverage.toFixed(1)}%
            </p>
            <p className="text-sm text-gray-600">
              Difference:{" "}
              {(
                selectedStudent.progress - classAverage
              ).toFixed(1)}
              %
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  /* ---------- Layout ---------- */

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header with Student Selector */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              {selectedClass.name}
            </h1>

            {/* Student Dropdown */}
            <select
              value={selectedStudent.id}
              onChange={(e) => {
                const student = selectedClass.students.find(
                  (s) => s.id === parseInt(e.target.value)
                );
                setSelectedStudent(student);
              }}
              className="mt-2 border border-slate-300 rounded-md px-3 py-1 text-sm"
            >
              {selectedClass.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CORE SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">

          {/* LEFT COLUMN */}
          <div className="space-y-4 lg:col-span-5">

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-sm text-gray-600">
                <strong>Name:</strong> {selectedStudent.name}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Email:</strong> {selectedStudent.email}
              </p>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold mb-2">
                Strengths
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                {(selectedStudent?.strengths || []).map((item, i) => (
                  <li key={i}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold mb-2">
                Areas for Improvement
              </p>
              {areasOfConcern.length === 0 ? (
                <div className="text-sm text-gray-600">No homework/classwork data yet.</div>
              ) : (
                <ul className="text-sm text-gray-600 space-y-1">
                  {areasOfConcern.map((t) => (
                    <li key={t.topic_id ?? t.topic_key}>
                      • {t.topic_name} ({Number(t.accuracy ?? 0).toFixed(1)}%)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Domain Radar under Areas for Improvement */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Domain Radar</p>
                  <p className="text-sm text-gray-600 mt-1">Initial vs current performance.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={
                      'px-3 py-1.5 rounded-md text-sm font-semibold border ' +
                      (radarView === 'baseline'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                    }
                    onClick={() => setRadarView('baseline')}
                  >
                    Initial
                  </button>
                  <button
                    type="button"
                    className={
                      'px-3 py-1.5 rounded-md text-sm font-semibold border ' +
                      (radarView === 'current'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50')
                    }
                    onClick={() => setRadarView('current')}
                  >
                    Current
                  </button>
                </div>
              </div>

              {radarStatus.loading ? (
                <div className="mt-3 text-sm text-gray-600">Loading radar...</div>
              ) : radarStatus.error ? (
                <div className="mt-3 text-sm text-red-600">{radarStatus.error}</div>
              ) : !radarData?.baseline ? (
                <div className="mt-3 text-sm text-gray-600">No diagnostic baseline yet for this student.</div>
              ) : (
                <div className="mt-3">
                  <div className="text-sm text-gray-600 mb-2">
                    {radarView === 'baseline'
                      ? (radarData?.baseline?.submittedAt ? `Initial: ${new Date(radarData.baseline.submittedAt).toLocaleString()}` : '')
                      : 'Current: since last diagnostic'}
                  </div>
                  {radarView === 'current' && isDemoStudentOne ? (
                    <div className="mb-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
                        Demo: vs Initial (+10 Shape & Space, +20 Data Handling, -10 Number, -8 Algebra, -6 Measures)
                      </span>
                    </div>
                  ) : null}
                  <DomainRadarChart
                    scoresByDomainKey={radarView === 'baseline' ? baselineMap : demoBoostedCurrentMap}
                    height={260}
                  />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:col-span-7 auto-rows-min">

            {/* Risk gets the full width */}
            <div className="bg-white rounded-xl p-4 shadow-sm sm:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Risk Assessment</p>
                  <p className="text-xs text-gray-500 mt-1">Deterministic labels with teacher override.</p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-gray-900 hover:underline"
                  disabled={!selectedRisk}
                  onClick={() => {
                    if (!selectedRisk) return;
                    setOverrideDraft({ scope: 'overall', domainKey: null, systemLabel: selectedRisk.overall.system_label });
                    setOverrideLabel(String(selectedRisk.overall.final_label || 'developing'));
                    setOverrideReason('');
                  }}
                >
                  Override
                </button>
              </div>

              {riskStatus.loading ? (
                <div className="mt-3 text-sm text-gray-600">Loading risk...</div>
              ) : riskStatus.error ? (
                <div className="mt-3 text-sm text-red-600">{riskStatus.error}</div>
              ) : !selectedRisk ? (
                <div className="mt-3 text-sm text-gray-600">No risk data.</div>
              ) : (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-700">Overall</div>
                    {riskBadge(selectedRisk.overall.final_label)}
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    High Risk &lt; {riskData?.thresholds?.high_risk_threshold ?? 50}% | Mastery &gt;= {riskData?.thresholds?.mastery_threshold ?? 70}%
                  </div>

                  <div className="space-y-2">
                    {(selectedRisk.domains || []).map((d) => (
                      <div key={d.domain_key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{domainKeyToLabel(d.domain_key)}</div>
                          <div className="text-xs text-gray-500">{Number(d.percent ?? 0).toFixed(1)}% ({d.attempted} attempts)</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {riskBadge(d.final_label)}
                          <button
                            type="button"
                            className="text-xs font-medium text-gray-900 hover:underline"
                            onClick={() => {
                              setOverrideDraft({ scope: 'domain', domainKey: d.domain_key, systemLabel: d.system_label });
                              setOverrideLabel(String(d.final_label || 'developing'));
                              setOverrideReason('');
                            }}
                          >
                            Override
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {overrideDraft ? (
                    <div className="mt-3 rounded-lg border border-gray-200 p-3">
                      <div className="text-xs font-semibold text-gray-700">Override {overrideDraft.scope === 'overall' ? 'Overall' : domainKeyToLabel(overrideDraft.domainKey)}</div>
                      {overrideStatus.error ? <div className="mt-2 text-xs text-red-600">{overrideStatus.error}</div> : null}
                      <div className="mt-2 grid md:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-xs font-medium text-gray-700">New label</span>
                          <select
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            value={overrideLabel}
                            onChange={(e) => setOverrideLabel(e.target.value)}
                            disabled={overrideStatus.saving}
                          >
                            <option value="high_risk">High Risk</option>
                            <option value="developing">Developing</option>
                            <option value="mastery">Mastery</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-gray-700">Reason</span>
                          <input
                            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="Optional"
                            disabled={overrideStatus.saving}
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                          disabled={overrideStatus.saving}
                          onClick={submitOverride}
                        >
                          {overrideStatus.saving ? 'Saving...' : 'Save override'}
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
                          onClick={() => setOverrideDraft(null)}
                          disabled={overrideStatus.saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Adaptive Difficulty</p>
                  <p className="text-xs text-gray-500 mt-1">Recommended tiers by topic.</p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-gray-900 hover:underline"
                  onClick={() => setShowAllAdaptive((p) => !p)}
                  disabled={adaptiveStatus.loading}
                >
                  {showAllAdaptive ? 'Show less' : 'Show all'}
                </button>
              </div>

              {adaptiveStatus.loading ? (
                <div className="mt-3 text-sm text-gray-600">Loading recommendations...</div>
              ) : adaptiveStatus.error ? (
                <div className="mt-3 text-sm text-red-600">{adaptiveStatus.error}</div>
              ) : adaptiveSorted.length === 0 ? (
                <div className="mt-3 text-sm text-gray-600">Not enough topic data yet.</div>
              ) : (
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span>Tier 1: {adaptiveCounts[1]}</span>
                    <span>|</span>
                    <span>Tier 2: {adaptiveCounts[2]}</span>
                    <span>|</span>
                    <span>Tier 3: {adaptiveCounts[3]}</span>
                  </div>

                  <div className="space-y-2">
                    {(showAllAdaptive ? adaptiveSorted : adaptiveSorted.slice(0, 6)).map((t) => (
                      <div
                        key={t.topic_id ?? t.topic_key}
                        className="rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{t.topic_name}</div>
                          <div className="text-xs text-gray-500">
                            {t.domain_name} | {Number(t.accuracy ?? 0).toFixed(1)}% ({t.attempted} attempts)
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-gray-700">{tierLabel(t.tier)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Class Thresholds</p>
                  <p className="text-xs text-gray-500 mt-1">Adjust High Risk and Mastery cutoffs.</p>
                </div>
              </div>

              {thresholdStatus.error ? (
                <div className="mt-3 text-sm text-red-600">{thresholdStatus.error}</div>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">High Risk &lt;</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={thresholds.highRisk}
                    onChange={(e) => setThresholds((p) => ({ ...p, highRisk: Number(e.target.value) }))}
                    disabled={thresholdStatus.saving}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Mastery &gt;=</span>
                  <input
                    type="number"
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    value={thresholds.mastery}
                    onChange={(e) => setThresholds((p) => ({ ...p, mastery: Number(e.target.value) }))}
                    disabled={thresholdStatus.saving}
                  />
                </label>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                  onClick={saveThresholds}
                  disabled={thresholdStatus.saving}
                >
                  {thresholdStatus.saving ? 'Saving...' : 'Save thresholds'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* INSIGHTS SECTION */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-4 text-slate-700">
            Insights
          </h2>

          {/* Customizable Widget Overview Section (persistent per user) */}
          <WidgetCustomizer selectedStudent={selectedStudent} />

          {/* All analytics widgets now fully controlled by WidgetCustomizer */}
        </div>
      </div>
    </div>
  );
}

export default ClassDetail;
