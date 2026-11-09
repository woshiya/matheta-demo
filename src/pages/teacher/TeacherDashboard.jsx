import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpFetch } from "../../lib/http";

function demoInterventionForClass(classId) {
  const id = String(classId);
  if (id === "2") {
    return {
      triggerSignal: "Low accuracy + slow responses",
      topic: "Algebra - Linear Equations",
      studentsAffected: 9,
      reasoning:
        "Students are spending longer than expected on linear equations and making consistent transposition/sign errors. The engine recommends scaffolding and short targeted practice before moving on.",
      recommendations: [
        { id: "extra_practice", type: "Practice", title: "Extra practice", subtitle: "2-mark easy questions to rebuild confidence" },
        { id: "scaffold", type: "Scaffold", title: "Easier scaffolded question", subtitle: "Guide steps: isolate variable, check work" },
        { id: "review", type: "Class review", title: "Review lesson", subtitle: "5-min reteach: transposition + sign" },
        { id: "group", type: "Small group", title: "Group support", subtitle: "Pull struggling students for 1-2 examples" },
        { id: "individual", type: "1:1", title: "Individual feedback", subtitle: "Correct misconceptions in-the-moment" },
      ],
    };
  }
  return {
    triggerSignal: "Repeated mistakes",
    topic: "Factorisation",
    studentsAffected: 7,
    reasoning:
      "The class has repeated incorrect attempts on factorisation. Accuracy is below the mastery threshold, and several students are taking longer than expected. The engine recommends targeted interventions instead of moving directly to harder questions.",
    recommendations: [
      { id: "extra_practice", type: "Practice", title: "Extra practice", subtitle: "Targeted similar questions" },
      { id: "scaffold", type: "Scaffold", title: "Easier scaffolded question", subtitle: "Break the skill into steps" },
      { id: "review", type: "Class review", title: "Review lesson", subtitle: "Quick reteach of common error" },
      { id: "group", type: "Small group", title: "Group support", subtitle: "Pull aside affected students" },
      { id: "individual", type: "1:1", title: "Individual feedback", subtitle: "Coach 1-2 students now" },
    ],
  };
}

function RecommendationCard({ rec, onSelect }) {
  if (!rec) return null;
  return (
    <button
      type="button"
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50"
      onClick={() => onSelect?.(rec)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{rec.title}</div>
          {rec.subtitle ? <div className="mt-0.5 text-xs text-gray-500">{rec.subtitle}</div> : null}
        </div>
        <span className="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">
          {rec.type}
        </span>
      </div>
    </button>
  );
}

export default function TeacherDashboard() {
  const [activeTab, setActiveTab] = useState("manage");
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [assignmentSummary, setAssignmentSummary] = useState([]);
  const [expandedClassIds, setExpandedClassIds] = useState(() => new Set());
  const [classAssignments, setClassAssignments] = useState({});
  useEffect(() => {
    async function loadTeacherClasses() {
      const user = JSON.parse(localStorage.getItem("user"));
      const teacherId = user?.id;
      if (!teacherId) return;
      try {
        const res = await httpFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) return;
        const data = await res.json();
        setClasses(Array.isArray(data) ? data : []);
      } catch {
        setClasses([]);
      }
    }
    loadTeacherClasses();
  }, []);

  useEffect(() => {
    async function loadAssignmentSummary() {
      const user = JSON.parse(localStorage.getItem("user"));
      const teacherId = user?.id;
      if (!teacherId) return;
      try {
        const res = await httpFetch(`/api/teachers/${teacherId}/assignment-summary`);
        if (!res.ok) return;
        const data = await res.json();
        setAssignmentSummary(Array.isArray(data) ? data : []);
      } catch {
        setAssignmentSummary([]);
      }
    }
    loadAssignmentSummary();
  }, []);

  function getSummary(classId, type) {
    return assignmentSummary.find((r) => r.class_id === classId && r.type === type) || null;
  }

  async function ensureAssignmentsLoaded(classId) {
    return ensureAssignmentsLoadedForType(classId, "all");
  }

  async function ensureAssignmentsLoadedForType(classId, type) {
    const key = `${classId}:${type}`;
    setClassAssignments((prev) => {
      if (prev[key]?.status === "loaded" || prev[key]?.status === "loading") return prev;
      return { ...prev, [key]: { status: "loading", items: [], error: null } };
    });

    try {
      const q = type === "hw" || type === "cw" ? `?type=${type}` : "";
      const res = await httpFetch(`/api/classes/${classId}/assignments${q}`);
      if (!res.ok) {
        setClassAssignments((prev) => ({
          ...prev,
          [key]: { status: "error", items: [], error: "Failed to load assignments" },
        }));
        return;
      }
      const data = await res.json();
      setClassAssignments((prev) => ({
        ...prev,
        [key]: { status: "loaded", items: Array.isArray(data) ? data : [], error: null },
      }));
    } catch {
      setClassAssignments((prev) => ({
        ...prev,
        [key]: { status: "error", items: [], error: "Failed to load assignments" },
      }));
    }
  }

  function toggleExpanded(classId) {
    setExpandedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
        ensureAssignmentsLoadedForType(classId, "all");
      }
      return next;
    });
  }

  const [assignmentTypeByClass, setAssignmentTypeByClass] = useState({});
  function setAssignmentTypeForClass(classId, type) {
    setAssignmentTypeByClass((prev) => ({ ...prev, [classId]: type }));
    ensureAssignmentsLoadedForType(classId, type);
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
  }

  const [interventionModal, setInterventionModal] = useState(null); // { classId, className }
  const [pickedIntervention, setPickedIntervention] = useState(null);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Page Title */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-6">
          Teacher Dashboard
        </h1>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab("manage")}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === "manage"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Manage
            </button>

            <button
              onClick={() => setActiveTab("insights")}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === "insights"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Insights
            </button>
          </div>
        </div>

        {/* MANAGE TAB */}
        {activeTab === "manage" && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">My Classes</h2>
                <span className="text-xs text-gray-500">{classes.length} total</span>
              </div>

              {classes.length === 0 ? (
                <p className="text-sm text-gray-600">No classes found.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {classes.map((cls) => (
                    <div key={cls.id} className="py-4 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {cls.name}
                          {Array.isArray(cls.subjects) && cls.subjects.length > 0
                            ? ` - ${cls.subjects.join(", ")}`
                            : ""}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {cls.student_count !== undefined && cls.student_count !== null
                            ? `${Number(cls.student_count)} students`
                            : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          className="text-sm font-medium text-gray-900 hover:underline"
                          onClick={() => navigate(`/teacher/class/${cls.id}`)}
                        >
                          Open 
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Assignments</h2>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Create homework and classwork per class. Lists and completion stats will appear here once assignment tracking is wired up.
              </p>

              <div className="space-y-4">
                {classes.map((cls) => (
                  <div key={cls.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {cls.name}
                          {Array.isArray(cls.subjects) && cls.subjects.length > 0
                            ? ` - ${cls.subjects.join(", ")}`
                            : ""}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {cls.student_count !== undefined && cls.student_count !== null
                            ? `${Number(cls.student_count)} students`
                            : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs font-medium text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
                          onClick={() => toggleExpanded(cls.id)}
                        >
                          {expandedClassIds.has(cls.id) ? "Hide" : "Details"}
                        </button>
                        <button
                          className="text-xs font-medium text-gray-900 hover:underline"
                          onClick={() => navigate(`/teacher/assignments/new?type=hw&classId=${cls.id}`)}
                        >
                          + HW
                        </button>
                        <button
                          className="text-xs font-medium text-gray-900 hover:underline"
                          onClick={() => navigate(`/teacher/assignments/new?type=cw&classId=${cls.id}`)}
                        >
                          + CW
                        </button>
                      </div>
                    </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="text-xs text-gray-500">Homework</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {getSummary(cls.id, "hw")?.assignments_count ?? 0}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-md p-3">
                        <div className="text-xs text-gray-500">Classwork</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {getSummary(cls.id, "cw")?.assignments_count ?? 0}
                        </div>
                      </div>
                    </div>

                    {expandedClassIds.has(cls.id) && (
                      <div className="mt-4 border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-semibold text-gray-700">Recent Assignments</div>
                          <button
                            className="text-xs font-medium text-gray-900 hover:underline"
                            onClick={() => navigate(`/teacher/assignments?classId=${cls.id}`)}
                          >
                            View all
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          {[
                            { id: "all", label: "All" },
                            { id: "hw", label: "HW" },
                            { id: "cw", label: "CW" },
                          ].map((t) => {
                            const selected = (assignmentTypeByClass[cls.id] || "all") === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                className={
                                  "px-2 py-1 rounded text-xs font-medium border " +
                                  (selected
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50")
                                }
                                onClick={() => setAssignmentTypeForClass(cls.id, t.id)}
                              >
                                {t.label}
                              </button>
                            );
                          })}
                        </div>

                        {(() => {
                          const t = assignmentTypeByClass[cls.id] || "all";
                          const key = `${cls.id}:${t}`;
                          const data = classAssignments[key];
                          if (!data || data.status === "loading") {
                            return <div className="text-sm text-gray-600">Loading...</div>;
                          }
                          if (data.status === "error") {
                            return <div className="text-sm text-red-600">{data.error}</div>;
                          }
                          if (data.status === "loaded") {
                            return (
                              <div className="space-y-2">
                                {data.items.length === 0 ? (
                                  <div className="text-sm text-gray-600">No assignments yet.</div>
                                ) : (
                                  data.items.slice(0, 6).map((a) => (
                                    <div
                                      key={a.id}
                                      className="flex items-center justify-between rounded-md border border-gray-100 bg-white px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-sm font-medium text-gray-900 break-words">
                                          {a.title}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-0.5">
                                          <span className="mr-2 inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-700">
                                            {a.type === "hw" ? "HW" : "CW"}
                                          </span>
                                          {a.due_at ? (
                                            <span className="mr-2">Due {formatDate(a.due_at)}</span>
                                          ) : a.scheduled_at ? (
                                            <span className="mr-2">On {formatDate(a.scheduled_at)}</span>
                                          ) : null}
                                          <span
                                            className={
                                              "mr-2 inline-flex items-center px-1.5 py-0.5 rounded border " +
                                              (String(a.status) === "published"
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-amber-200 bg-amber-50 text-amber-700")
                                            }
                                          >
                                            {String(a.status) === "published" ? "Published" : "Draft"}
                                          </span>
                                          <span>{Number(a.completed_count ?? 0)} students completed</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <button
                                          className="text-xs font-medium text-gray-900 hover:underline"
                                          onClick={() => navigate(`/teacher/assignments/${a.id}?classId=${cls.id}`)}
                                        >
                                          View
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* INSIGHTS TAB */}
        {activeTab === "insights" && (
          <div className="space-y-10">
            {/* Existing class summaries - remain always visible below */}
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-lg border border-gray-200 p-6"
              >
                {/* Class Header */}
                <h2 className="text-lg font-semibold text-gray-800 mb-6">
                  {cls.name}
                  {Array.isArray(cls.subjects) && cls.subjects.length > 0
                    ? ` – ${cls.subjects.join(", ")}`
                    : ""}
                </h2>

                {/* Insight Summary Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-md p-4">
                    <p className="text-xs text-gray-500">Total Students</p>
                    <p className="text-lg font-semibold text-gray-800">28</p>
                  </div>

                  <div className="bg-gray-50 rounded-md p-4">
                    <p className="text-xs text-gray-500">Class Average</p>
                    <p className="text-lg font-semibold text-gray-800">78%</p>
                  </div>

                  <div className="bg-gray-50 rounded-md p-4">
                    <p className="text-xs text-gray-500">Need Support</p>
                    <p className="text-lg font-semibold text-gray-800">
                      2 students
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-md p-4">
                    <p className="text-xs text-gray-500">Excellent Progress</p>
                    <p className="text-lg font-semibold text-gray-800">
                      3 students
                    </p>
                  </div>
                </div>

                {/* Class Activity Snapshot */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Class Activity
                  </h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>24 / 28 students submitted last assignment</li>
                    <li>3 students submitted late</li>
                    <li>2 students missing 3+ homework</li>
                    <li>Homework completion rate: 86%</li>
                  </ul>
                </div>

                {/* Action Button */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                  <button
                    className="text-sm font-medium text-gray-900 hover:underline text-left"
                    onClick={() => {
                      setPickedIntervention(null);
                      setInterventionModal({
                        classId: cls.id,
                        className: `${cls.name}${Array.isArray(cls.subjects) && cls.subjects.length > 0 ? ` – ${cls.subjects.join(", ")}` : ""}`,
                      });
                    }}
                  >
                    AI Intervention Recommendations →
                  </button>
                  <button
                    className="text-sm font-medium text-gray-900 hover:underline"
                    onClick={() => navigate(`/teacher/class/${cls.id}`)}
                  >
                    View Student Performance →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {interventionModal ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              // Close when clicking backdrop.
              if (e.target === e.currentTarget) setInterventionModal(null);
            }}
          >
            <div className="w-full max-w-3xl rounded-xl bg-white border border-gray-200 shadow-xl">
              <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">AI Intervention Recommendations</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {interventionModal.className}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    Teacher reviews before use
                  </span>
                  <button
                    type="button"
                    className="text-sm font-medium text-gray-700 hover:underline"
                    onClick={() => setInterventionModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              {(() => {
                const engine = demoInterventionForClass(interventionModal.classId);
                return (
                  <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="text-xs font-semibold text-gray-700">Trigger Signal</div>
                      <div className="mt-1 text-sm text-gray-900">{engine.triggerSignal}</div>

                      <div className="mt-4 text-xs font-semibold text-gray-700">Topic</div>
                      <div className="mt-1 text-sm text-gray-900">{engine.topic}</div>

                      <div className="mt-4 text-xs font-semibold text-gray-700">Students Affected</div>
                      <div className="mt-1 text-sm text-gray-900">{engine.studentsAffected}</div>

                      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs font-semibold text-gray-700">AI Reasoning Summary</div>
                        <div className="mt-2 text-sm text-gray-800">{engine.reasoning}</div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-700">AI can recommend</div>
                          <div className="mt-1 text-[11px] text-gray-500">Select one to stage an action (demo).</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {(engine.recommendations || []).map((rec) => (
                          <RecommendationCard key={rec.id} rec={rec} onSelect={setPickedIntervention} />
                        ))}
                      </div>

                      {pickedIntervention ? (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-xs font-semibold text-emerald-900">Selected</div>
                          <div className="mt-1 text-sm text-emerald-900">{pickedIntervention.title}</div>
                          <div className="mt-3 flex items-center gap-3">
                            <button
                              type="button"
                              className="px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
                              onClick={() => {
                                // Demo: route teacher to assignment creation for this class.
                                setInterventionModal(null);
                                navigate(`/teacher/assignments/new?type=hw&classId=${encodeURIComponent(String(interventionModal.classId))}`);
                              }}
                            >
                              Create Practice Assignment (Demo) →
                            </button>
                            <button
                              type="button"
                              className="px-3 py-2 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50"
                              onClick={() => setPickedIntervention(null)}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
