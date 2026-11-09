import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSocket } from '../../lib/realtime';
import { httpFetch } from '../../lib/http';
import { API_BASE_URL } from '../../lib/api';

export default function LiveSessionSetup() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [status, setStatus] = useState({ connected: false, error: null });
  const [form, setForm] = useState({ classId: '', assignmentId: '' });
  const [sessionId, setSessionId] = useState('');
  const [pacingMode, setPacingMode] = useState('student_paced'); // student_paced | teacher_led
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState({ classes: false, assignments: false });
  const [reports, setReports] = useState([]);
  const [reportsStatus, setReportsStatus] = useState({ loading: false, error: null });

  useEffect(() => {
    const isDemoMode = !String(API_BASE_URL || '').trim();
    if (isDemoMode) return;

    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setStatus((s) => ({ ...s, connected: true, error: null }));
    const onDisconnect = () => setStatus((s) => ({ ...s, connected: false }));
    const onConnectError = (err) => setStatus((s) => ({ ...s, error: String(err?.message || err) }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.disconnect();
    };
  }, []);

  const teacherId = useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.id ? String(user.id) : null;
  }, []);

  useEffect(() => {
    async function loadTeacherClasses() {
      if (!teacherId) return;
      setLoading((l) => ({ ...l, classes: true }));
      try {
        const res = await httpFetch(`/api/teachers/${teacherId}/classes`);
        if (!res.ok) throw new Error('Failed to load classes');
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setClasses(list);
        // Default select first class
        if (!form.classId && list.length > 0) {
          setForm((f) => ({ ...f, classId: String(list[0].id) }));
        }
      } catch {
        setClasses([]);
      } finally {
        setLoading((l) => ({ ...l, classes: false }));
      }
    }
    loadTeacherClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  useEffect(() => {
    async function loadReports() {
      if (!teacherId) return;
      setReportsStatus({ loading: true, error: null });
      try {
        const res = await httpFetch(`/api/realtime/reports?teacherId=${encodeURIComponent(String(teacherId))}`);
        if (!res.ok) throw new Error('Failed to load reports');
        const data = await res.json();
        // Backend returns an array of reports; demo mode matches that.
        setReports(Array.isArray(data) ? data : Array.isArray(data?.reports) ? data.reports : []);
        setReportsStatus({ loading: false, error: null });
      } catch (err) {
        setReports([]);
        setReportsStatus({ loading: false, error: String(err?.message || err) });
      }
    }
    loadReports();
  }, [teacherId]);

  // Reports are loaded automatically from the backend.

  useEffect(() => {
    async function loadClassAssignments() {
      const classId = form.classId;
      if (!classId) {
        setAssignments([]);
        return;
      }
      setLoading((l) => ({ ...l, assignments: true }));
      try {
        // Show all published assignments for the class (HW or CW).
        const res = await httpFetch(`/api/classes/${classId}/assignments`);
        if (!res.ok) throw new Error('Failed to load assignments');
        const data = await res.json();
        // Only show published CWs.
        const list = (Array.isArray(data) ? data : []).filter((a) => String(a?.status) === 'published');
        setAssignments(list);
        if (!form.assignmentId && list.length > 0) {
          setForm((f) => ({ ...f, assignmentId: String(list[0].id) }));
        }
      } catch {
        setAssignments([]);
      } finally {
        setLoading((l) => ({ ...l, assignments: false }));
      }
    }
    loadClassAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classId]);

  async function refreshAssignments() {
    const classId = form.classId;
    if (!classId) return;
    setLoading((l) => ({ ...l, assignments: true }));
    try {
      const res = await httpFetch(`/api/classes/${classId}/assignments`);
      if (!res.ok) throw new Error('Failed to load assignments');
      const data = await res.json();
      const list = (Array.isArray(data) ? data : []).filter((a) => String(a?.status) === 'published');
      setAssignments(list);
      if (!list.some((a) => String(a.id) === String(form.assignmentId))) {
        setForm((f) => ({ ...f, assignmentId: list[0] ? String(list[0].id) : '' }));
      }
    } catch {
      setAssignments([]);
    } finally {
      setLoading((l) => ({ ...l, assignments: false }));
    }
  }

  function makeJoinCode() {
    // Human-friendly, URL-safe join code.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  // Generate a default session id for convenience.
  useEffect(() => {
    if (!sessionId) setSessionId(makeJoinCode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seedClasswork() {
    if (!teacherId || !form.classId) return;
    setStatus((s) => ({ ...s, error: null }));
    try {
      const res = await httpFetch(`/api/seed-cw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, classId: form.classId }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Failed to create classwork');
      }
      // Reload CW list
      const r2 = await httpFetch(`/api/classes/${form.classId}/assignments`);
      const data2 = r2.ok ? await r2.json() : [];
      const list2 = (Array.isArray(data2) ? data2 : []).filter((a) => String(a?.status) === 'published');
      setAssignments(list2);
      if (list2.length > 0) setForm((f) => ({ ...f, assignmentId: String(list2[0].id) }));
    } catch (err) {
      setStatus((s) => ({ ...s, error: String(err?.message || err) }));
    }
  }

  async function startSession(e) {
    e.preventDefault();
    const isDemoMode = !String(API_BASE_URL || '').trim();
    if (isDemoMode) {
      // Static showcase: jump straight to a pre-populated live room (3A).
      // This shows the live dashboard state without websockets.
      navigate(`/teacher/live/${encodeURIComponent('DEMO-SESSION-1')}`);
      return;
    }

    if (!socketRef.current) return;

    setStatus((s) => ({ ...s, error: null }));

    const payload = {
      classId: form.classId,
      assignmentId: form.assignmentId,
      teacherId,
      sessionId: sessionId.trim() || undefined,
      pacingMode,
      timestamp: new Date().toISOString(),
    };

    const res = await new Promise((resolve) => {
      socketRef.current.emit('teacher_start_session', payload, resolve);
    });

    if (!res?.ok) {
      setStatus((s) => ({ ...s, error: res?.error || 'Failed to start session' }));
      return;
    }

    // Go to live room page and pass sessionId
    navigate(`/teacher/live/${res.sessionId}`);
  }

  return (
    <div className="max-w-3xl">
      {!String(API_BASE_URL || '').trim() ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Demo mode</div>
          <div className="mt-1 text-amber-900/90">
            Interactive live sessions require a backend + websockets. Use the demo session reports below to showcase what the live analytics looks like.
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Session Setup</h1>
          <p className="text-sm text-gray-600 mt-1">
            Start a session. Students join using the session ID.
          </p>
        </div>
        <div className="text-sm">
          <span
            className={`inline-flex items-center px-2 py-1 rounded border ${
              status.connected
                ? 'bg-green-50 text-green-800 border-green-200'
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {!String(API_BASE_URL || '').trim() ? 'Demo (no socket)' : status.connected ? 'Socket connected' : 'Socket disconnected'}
          </span>
        </div>
      </div>

      <form onSubmit={startSession} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Class</span>
            <select
              value={form.classId}
              onChange={(e) => {
                const nextClassId = e.target.value;
                setForm((f) => ({ ...f, classId: nextClassId, assignmentId: '' }));
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              disabled={loading.classes || classes.length === 0}
              required
            >
              {classes.length === 0 ? (
                <option value="">{loading.classes ? 'Loading classes...' : 'No classes found'}</option>
              ) : (
                classes.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {Array.isArray(c.subjects) && c.subjects.length > 0 ? ` - ${c.subjects.join(', ')}` : ''}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Classwork pacing</span>
            <select
              value={pacingMode}
              onChange={(e) => setPacingMode(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="student_paced">Student-paced (students progress independently)</option>
              <option value="teacher_led">Teacher-led (1 question at a time)</option>
            </select>
          </label>

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="block text-sm font-medium text-gray-700">Assignment</span>
              <button
                type="button"
                onClick={refreshAssignments}
                className="text-xs text-gray-700 hover:underline disabled:opacity-50"
                disabled={!form.classId || loading.assignments}
                title="Refresh assignment list"
              >
                Refresh
              </button>
            </div>
            <select
              value={form.assignmentId}
              onChange={(e) => setForm((f) => ({ ...f, assignmentId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              disabled={!form.classId || loading.assignments || assignments.length === 0}
              required
            >
              {assignments.length === 0 ? (
                <option value="">{loading.assignments ? 'Loading assignments...' : 'No published assignments found'}</option>
              ) : (
                assignments.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.title} {a.type ? `(${String(a.type).toUpperCase()})` : ''}
                  </option>
                ))
              )}
            </select>
            {form.classId && !loading.assignments && assignments.length === 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs text-gray-500">No published assignments found for this class.</div>
                <button
                  type="button"
                  onClick={seedClasswork}
                  className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
                >
                  Create CW
                </button>
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Session ID</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                placeholder="e.g. 7K3M9PQA"
              />
              <button
                type="button"
                onClick={() => setSessionId(makeJoinCode())}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Random
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Students use this code to join.
            </p>
          </label>
        </div>

        {status.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {status.error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={(!String(API_BASE_URL || '').trim() ? false : !status.connected) || !form.classId || !form.assignmentId}
            className="inline-flex items-center rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {!String(API_BASE_URL || '').trim() ? 'View Demo Live Session' : 'Start Session'}
          </button>
          <p className="text-xs text-gray-500">
            {!String(API_BASE_URL || '').trim()
              ? 'This is a static demo. Use the reports to show live analytics output.'
              : 'Session state is in-memory and resets on backend restart.'}
          </p>
        </div>
      </form>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Session Reports</h2>
        <p className="text-xs text-gray-500 mt-1">Reports from previously conducted sessions appear here automatically.</p>

        {reportsStatus.error ? (
          <div className="mt-3 text-sm text-red-700">{reportsStatus.error}</div>
        ) : null}

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={async () => {
                  // refresh
                  setReportsStatus({ loading: true, error: null });
                try {
                  const res = await httpFetch(`/api/realtime/reports?teacherId=${encodeURIComponent(String(teacherId))}`);
                  if (!res.ok) throw new Error('Failed to load reports');
                  const data = await res.json();
                  setReports(Array.isArray(data) ? data : Array.isArray(data?.reports) ? data.reports : []);
                  setReportsStatus({ loading: false, error: null });
                } catch (err) {
                  setReports([]);
                  setReportsStatus({ loading: false, error: String(err?.message || err) });
                }
              }}
              disabled={reportsStatus.loading}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {reportsStatus.loading ? (
            <div className="text-sm text-gray-600">Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className="text-sm text-gray-600">No reports yet. End a live session to generate one.</div>
          ) : (
            reports.map((r) => (
              <div key={r.sessionId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{r.assignmentTitle || `Assignment ${r.assignmentId}`}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Session <span className="font-mono">{r.sessionId}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Ended: {r.endedAt ? new Date(r.endedAt).toLocaleString() : '-'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/teacher/live/reports/${r.sessionId}`)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    View report
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
                  <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">Raised: {r.summary?.raisedHandCount ?? 0}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">Struggling: {r.summary?.strugglingCount ?? 0}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-gray-50">Inactive: {r.summary?.inactiveCount ?? 0}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
