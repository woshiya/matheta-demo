import React, { useEffect, useMemo, useState } from 'react';
import { httpFetch } from '../../lib/http';

function Pill({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-white text-xs text-gray-700">
      {children}
    </span>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-md border ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-2 text-xs text-gray-500">{hint}</div> : null}
    </div>
  );
}

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [status, setStatus] = useState({ loading: true, error: null });

  const [classes, setClasses] = useState([]);
  const [classSummaryRows, setClassSummaryRows] = useState([]);
  const [classCards, setClassCards] = useState([]);
  const [insights, setInsights] = useState({ assignments: [], weakAreas: [], strongAreas: [] });
  // Global alerts tiles removed; upcoming/missed are shown inside each class card.

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }, []);
  const studentId = user?.id;

  useEffect(() => {
    async function load() {
      if (!studentId) {
        setStatus({ loading: false, error: 'Missing student id' });
        return;
      }
      setStatus({ loading: true, error: null });
      try {
        const [cRes, sRes, cCardsRes, iRes] = await Promise.all([
          httpFetch(`/api/students/${studentId}/classes`),
          httpFetch(`/api/students/${studentId}/class-summary`),
          httpFetch(`/api/students/${studentId}/class-cards`),
          httpFetch(`/api/students/${studentId}/insights/recent`),
        ]);

        // no global alerts fetch

        if (!cRes.ok) throw new Error('Failed to load classes');
        const cData = await cRes.json();
        setClasses(Array.isArray(cData) ? cData : []);

        if (sRes.ok) {
          const sData = await sRes.json();
          setClassSummaryRows(Array.isArray(sData) ? sData : []);
        } else {
          setClassSummaryRows([]);
        }

        if (cCardsRes.ok) {
          const ccData = await cCardsRes.json();
          setClassCards(Array.isArray(ccData) ? ccData : []);
        } else {
          setClassCards([]);
        }

        if (iRes.ok) {
          const iData = await iRes.json();
          setInsights({
            assignments: Array.isArray(iData.assignments) ? iData.assignments : [],
            weakAreas: Array.isArray(iData.weakAreas) ? iData.weakAreas : [],
            strongAreas: Array.isArray(iData.strongAreas) ? iData.strongAreas : [],
          });
        } else {
          setInsights({ assignments: [], weakAreas: [], strongAreas: [] });
        }

        // no global alerts

        setStatus({ loading: false, error: null });
      } catch (err) {
        setStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    load();
  }, [studentId]);

  const classCardByClassId = useMemo(() => {
    const map = Object.create(null);
    for (const r of classCards) {
      map[String(r.class_id)] = {
        hw: r.hw_count ?? 0,
        cw: r.cw_count ?? 0,
        upcoming: r.upcoming_count ?? 0,
        missed: r.missed_count ?? 0,
        upcomingAssignments: Array.isArray(r.upcoming_assignments) ? r.upcoming_assignments : [],
        missedAssignments: Array.isArray(r.missed_assignments) ? r.missed_assignments : [],
      };
    }
    return map;
  }, [classCards]);

  const summaryByClass = useMemo(() => {
    const map = Object.create(null);
    for (const r of classSummaryRows) {
      const classId = String(r.class_id);
      if (!map[classId]) map[classId] = { hw: 0, cw: 0, upcomingHw: 0 };
      if (r.type === 'hw') {
        map[classId].hw = r.assignments_count || 0;
        map[classId].upcomingHw = r.upcoming_hw_count || 0;
      }
      if (r.type === 'cw') {
        map[classId].cw = r.assignments_count || 0;
      }
    }
    return map;
  }, [classSummaryRows]);

  if (status.loading) {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="text-sm text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-6xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Student Dashboard</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill>{user?.name || 'Student'}</Pill>
              {user?.email ? <Pill>{user.email}</Pill> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={activeTab === 'insights'} onClick={() => setActiveTab('insights')}>
            Insights
          </TabButton>
        </div>

        {activeTab === 'overview' ? (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard label="Classes" value={classes.length} />
              <StatCard
                label="Total HW"
                value={Object.values(summaryByClass).reduce((a, x) => a + (x.hw || 0), 0)}
                hint="Across your classes"
              />
              <StatCard
                label="Total CW"
                value={Object.values(summaryByClass).reduce((a, x) => a + (x.cw || 0), 0)}
                hint="Across your classes"
              />
              <StatCard
                label="Upcoming HW"
                value={Object.values(summaryByClass).reduce((a, x) => a + (x.upcomingHw || 0), 0)}
                hint="Due in next 7 days"
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">My Classes</h2>
              <p className="text-xs text-gray-500 mt-1">
                Per-class workload summary. Use the sidebar to open a class page.
              </p>

              <div className="mt-4 grid gap-3">
                {classes.length === 0 ? (
                  <div className="text-sm text-gray-600">No classes found.</div>
                ) : (
                classes.map((c) => {
                    const s = summaryByClass[String(c.id)] || { hw: 0, cw: 0, upcomingHw: 0 };
                    const card = classCardByClassId[String(c.id)] || {
                      upcoming: 0,
                      missed: 0,
                      upcomingAssignments: [],
                      missedAssignments: [],
                    };
                    return (
                      <div
                        key={c.id}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                            {Array.isArray(c.subjects) && c.subjects.length > 0 ? (
                              <div className="text-xs text-gray-600 mt-1">{c.subjects.join(', ')}</div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Pill>HW: {s.hw}</Pill>
                            <Pill>CW: {s.cw}</Pill>
                            <Pill>Upcoming HW: {s.upcomingHw}</Pill>
                            <Pill>Upcoming: {card.upcoming}</Pill>
                            <Pill>Missed: {card.missed}</Pill>
                          </div>
                        </div>

                        <div className="mt-4 grid md:grid-cols-2 gap-3">
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="text-xs font-semibold text-gray-800">Upcoming (next 14 days)</div>
                            <div className="mt-2 space-y-2">
                              {(card.upcomingAssignments || []).length === 0 ? (
                                <div className="text-sm text-gray-600">None.</div>
                              ) : (
                                (card.upcomingAssignments || []).map((a) => (
                                  <div key={a.assignmentId} className="text-sm">
                                    <div className="font-medium text-gray-900">
                                      {String(a.type || '').toUpperCase()} - {a.title}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      Due: {a.dueAt ? new Date(a.dueAt).toLocaleString() : '—'}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="text-xs font-semibold text-gray-800">Missed (past due)</div>
                            <div className="mt-2 space-y-2">
                              {(card.missedAssignments || []).length === 0 ? (
                                <div className="text-sm text-gray-600">None.</div>
                              ) : (
                                (card.missedAssignments || []).map((a) => (
                                  <div key={a.assignmentId} className="text-sm">
                                    <div className="font-medium text-gray-900">
                                      {String(a.type || '').toUpperCase()} - {a.title}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                      Due: {a.dueAt ? new Date(a.dueAt).toLocaleString() : '—'}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Global upcoming/missed tiles removed (now shown per class) */}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Recent Assignments (Last 3)</h2>
              <p className="text-xs text-gray-500 mt-1">
                Your accuracy vs class average (if submissions exist).
              </p>

              <div className="mt-4 space-y-3">
                {insights.assignments.length === 0 ? (
                  <div className="text-sm text-gray-600">No recent assignments found.</div>
                ) : (
                  insights.assignments.map((a) => (
                    <div key={a.assignmentId} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {String(a.type || '').toUpperCase()} - {a.title}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">You</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {a.studentAccuracy === null ? '—' : `${a.studentAccuracy}%`}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        Class average: {a.classAccuracy === null ? '—' : `${a.classAccuracy}%`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">Strengths & Weak Areas</h2>
              <p className="text-xs text-gray-500 mt-1">
                Based on your last 3 published assignments (needs topic-tagged questions).
              </p>

              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-700">Weak areas</div>
                <div className="mt-2 space-y-2">
                  {insights.weakAreas.length === 0 ? (
                    <div className="text-sm text-gray-600">Not enough data yet.</div>
                  ) : (
                    insights.weakAreas.map((t) => (
                      <div key={`${t.topicId}-${t.topicName}`} className="flex items-center justify-between text-sm">
                        <div className="text-gray-800">{t.topicName}</div>
                        <div className="font-medium text-red-700">{t.accuracy}%</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 text-xs font-semibold text-gray-700">Strong areas</div>
                <div className="mt-2 space-y-2">
                  {insights.strongAreas.length === 0 ? (
                    <div className="text-sm text-gray-600">Not enough data yet.</div>
                  ) : (
                    insights.strongAreas.map((t) => (
                      <div key={`${t.topicId}-${t.topicName}`} className="flex items-center justify-between text-sm">
                        <div className="text-gray-800">{t.topicName}</div>
                        <div className="font-medium text-green-700">{t.accuracy}%</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
