import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSocket } from '../../lib/realtime';
import LiveSessionAssignmentTab from './LiveSessionAssignmentTab';
import { httpFetch } from '../../lib/http';

function studentLabel(studentIndex, id) {
  const key = String(id);
  const s = studentIndex[key];
  const name = s?.name ? String(s.name) : null;
  return name ? `${name} (${key})` : key;
}

function studentLabelFromObject(studentIndex, s) {
  const id = s?.studentId;
  if (!id) return null;
  const key = String(id);
  const name = s?.name ? String(s.name) : (studentIndex[key]?.name ? String(studentIndex[key].name) : null);
  return name ? `${name} (${key})` : key;
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

export default function LiveSessionRoom() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [update, setUpdate] = useState(null);
  const [tab, setTab] = useState('insights'); // insights | assignment

  const [blackboard, setBlackboard] = useState({ questionId: null, workingText: '', showAnswer: false });
  const [assignmentDetail, setAssignmentDetail] = useState(null); // { assignment, questions }
  const [assignmentLoad, setAssignmentLoad] = useState({ loading: false, error: null });

  const pacingMode = String(update?.pacingMode || 'student_paced');
  const currentQuestionIndex = Number(update?.currentQuestionIndex ?? 0);

  const studentIndex = useMemo(() => {
    const out = Object.create(null);
    for (const s of update?.students || []) {
      if (!s?.studentId) continue;
      out[String(s.studentId)] = s;
    }
    return out;
  }, [update?.students]);
  const teacherLedQuestions = useMemo(() => {
    const qs = Array.isArray(assignmentDetail?.questions) ? assignmentDetail.questions : [];
    return qs;
  }, [assignmentDetail?.questions]);

  const currentQuestion = useMemo(() => {
    const qs = teacherLedQuestions;
    if (!qs.length) return null;
    const idx = Math.max(0, Math.min(qs.length - 1, Number(currentQuestionIndex) || 0));
    return qs[idx] || null;
  }, [teacherLedQuestions, currentQuestionIndex]);

  const currentQuestionId = currentQuestion?.id ? String(currentQuestion.id) : null;

  const currentQuestionSignals = useMemo(() => {
    const qid = currentQuestionId;
    const empty = { raised: 0, difficult: 0, answered: 0 };
    if (!qid) return empty;

    const hands = (update?.questionRaisedHands || []).find((x) => String(x?.questionId) === String(qid));
    const diff = (update?.questionDifficult || []).find((x) => String(x?.questionId) === String(qid));
    const ans = (update?.questionAnswered || []).find((x) => String(x?.questionId) === String(qid));
    return {
      raised: Number(hands?.count ?? 0),
      difficult: Number(diff?.count ?? 0),
      answered: Number(ans?.count ?? 0),
    };
  }, [update?.questionRaisedHands, update?.questionDifficult, update?.questionAnswered, currentQuestionId]);

  const currentQuestionNames = useMemo(() => {
    const qid = currentQuestionId;
    const empty = { raised: [], difficult: [], answered: [] };
    if (!qid) return empty;

    const normNames = (row) => {
      const fromStudents = Array.isArray(row?.students) ? row.students : [];
      if (fromStudents.length) {
        return fromStudents
          .map((s) => studentLabelFromObject(studentIndex, s))
          .filter(Boolean);
      }
      const ids = Array.isArray(row?.studentIds) ? row.studentIds : [];
      return ids.map((id) => studentLabel(studentIndex, id)).filter(Boolean);
    };

    const hands = (update?.questionRaisedHands || []).find((x) => String(x?.questionId) === String(qid));
    const diff = (update?.questionDifficult || []).find((x) => String(x?.questionId) === String(qid));
    const ans = (update?.questionAnswered || []).find((x) => String(x?.questionId) === String(qid));
    return {
      raised: normNames(hands),
      difficult: normNames(diff),
      answered: normNames(ans),
    };
  }, [update?.questionRaisedHands, update?.questionDifficult, update?.questionAnswered, currentQuestionId, studentIndex]);

  // Keep the UI responsive immediately after clicking Next, even before the next session_update arrives.
  useEffect(() => {
    if (pacingMode !== 'teacher_led') return;
    if (!socketRef.current) return;
    const socket = socketRef.current;
    const onPace = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      setUpdate((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pacingMode: String(payload?.pacingMode || prev.pacingMode || 'teacher_led'),
          currentQuestionIndex: Number(payload?.currentQuestionIndex ?? prev.currentQuestionIndex ?? 0),
        };
      });

      if (payload?.blackboard) {
        setBlackboard({
          questionId: payload.blackboard?.questionId ? String(payload.blackboard.questionId) : null,
          workingText: String(payload.blackboard?.workingText || ''),
          showAnswer: Boolean(payload.blackboard?.showAnswer),
        });
      }
    };
    socket.on('teacher_pace_update', onPace);
    return () => {
      socket.off('teacher_pace_update', onPace);
    };
  }, [pacingMode, sessionId]);

  const perQuestionSignals = useMemo(() => {
    const out = Object.create(null);
    const ensure = (qid) => {
      const key = String(qid);
      if (!out[key]) {
        out[key] = {
          questionId: key,
          raised: { count: 0, studentIds: [] },
          difficult: { count: 0, studentIds: [] },
          slow: { count: 0, studentIds: [] },
        };
      }
      return out[key];
    };

    for (const q of update?.questionRaisedHands || []) {
      const row = ensure(q.questionId);
      row.raised = {
        count: Number(q?.count ?? 0),
        studentIds: Array.isArray(q?.studentIds) ? q.studentIds.slice() : [],
        students: Array.isArray(q?.students) ? q.students.slice() : [],
      };
    }
    for (const q of update?.questionDifficult || []) {
      const row = ensure(q.questionId);
      row.difficult = {
        count: Number(q?.count ?? 0),
        studentIds: Array.isArray(q?.studentIds) ? q.studentIds.slice() : [],
        students: Array.isArray(q?.students) ? q.students.slice() : [],
      };
    }
    for (const q of update?.slowByQuestion || []) {
      const row = ensure(q.questionId);
      row.slow = {
        count: Number(q?.count ?? 0),
        studentIds: Array.isArray(q?.studentIds) ? q.studentIds.slice() : [],
        students: Array.isArray(q?.students) ? q.students.slice() : [],
      };
    }

    return Object.values(out).sort((a, b) => Number(a.questionId) - Number(b.questionId));
  }, [update?.questionRaisedHands, update?.questionDifficult, update?.slowByQuestion]);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => setError(String(err?.message || err));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    const onSessionUpdate = (payload) => {
      if (payload?.sessionId !== sessionId) return;
      setUpdate(payload);
    };
    socket.on('session_update', onSessionUpdate);

    const onBlackboardUpdate = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      setBlackboard({
        questionId: payload?.questionId ? String(payload.questionId) : null,
        workingText: String(payload?.workingText || ''),
        showAnswer: Boolean(payload?.showAnswer),
      });
    };
    socket.on('blackboard_update', onBlackboardUpdate);

    // Join as teacher to receive aggregated updates.
    const user = JSON.parse(localStorage.getItem('user'));
    socket.emit(
      'teacher_join_session',
      {
        sessionId,
        teacherId: user?.id,
        timestamp: Date.now(),
      },
      (ack) => {
        if (!ack?.ok) setError(ack?.error || 'Failed to join session');
      }
    );

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session_update', onSessionUpdate);
      socket.off('blackboard_update', onBlackboardUpdate);
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    async function loadAssignment() {
      const assignmentId = update?.assignmentId;
      if (!assignmentId) {
        setAssignmentDetail(null);
        return;
      }
      if (pacingMode !== 'teacher_led') {
        // Only needed for teacher-led board.
        setAssignmentDetail(null);
        return;
      }
      setAssignmentLoad({ loading: true, error: null });
      try {
        const res = await httpFetch(`/api/assignments/${encodeURIComponent(String(assignmentId))}`);
        if (!res.ok) throw new Error('Failed to load assignment');
        const json = await res.json();
        setAssignmentDetail(json);
        setAssignmentLoad({ loading: false, error: null });
      } catch (err) {
        setAssignmentDetail(null);
        setAssignmentLoad({ loading: false, error: String(err?.message || err) });
      }
    }
    loadAssignment();
  }, [update?.assignmentId, pacingMode]);

  async function updateBlackboard(next) {
    if (!socketRef.current) return;
    if (!next?.questionId) return;
    setError(null);
    const res = await new Promise((resolve) => {
      socketRef.current.emit(
        'teacher_blackboard_update',
        {
          sessionId,
          questionId: String(next.questionId),
          workingText: String(next.workingText || ''),
          showAnswer: Boolean(next.showAnswer),
          timestamp: Date.now(),
        },
        resolve
      );
    });
    if (!res?.ok) setError(res?.error || 'Failed to update blackboard');
  }

  function renderTeacherLedBoard() {
    if (pacingMode !== 'teacher_led') return null;

    const q = currentQuestion;
    const qid = currentQuestionId;
    const showAnswer = Boolean(blackboard?.showAnswer);
    const workingText = String(blackboard?.workingText || '');

    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {assignmentLoad.loading ? (
            <div className="text-sm text-gray-600">Loading question...</div>
          ) : assignmentLoad.error ? (
            <div className="text-sm text-red-700">{assignmentLoad.error}</div>
          ) : !q ? (
            <div className="text-sm text-gray-600">No questions loaded yet.</div>
          ) : (
            <>
              <div className="text-xs text-gray-500">Current question</div>
              <div className="mt-1 text-base font-semibold text-gray-900">Q{currentQuestionIndex + 1}. {q.prompt}</div>

              <div className="mt-4">
                <div className="text-xs text-gray-500">Teacher working (blackboard)</div>
                <textarea
                  value={workingText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBlackboard((prev) => ({ ...prev, questionId: qid, workingText: next }));
                    if (qid) updateBlackboard({ questionId: qid, workingText: next, showAnswer });
                  }}
                  placeholder="Type the steps/working here..."
                  className="mt-2 w-full min-h-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-900">Answer</div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showAnswer;
                      setBlackboard((prev) => ({ ...prev, questionId: qid, showAnswer: next }));
                      if (qid) updateBlackboard({ questionId: qid, workingText, showAnswer: next });
                    }}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
                  >
                    {showAnswer ? 'Hide answer' : 'Show answer'}
                  </button>
                </div>
                {showAnswer ? (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs font-semibold text-emerald-900">Correct answer</div>
                    <div className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">{q.correct_answer ?? 'No answer provided.'}</div>
                    {q.solution_text ? (
                      <>
                        <div className="mt-3 text-xs font-semibold text-emerald-900">Solution</div>
                        <div className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">{q.solution_text}</div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-gray-600">Hidden</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Live signals (this question)</div>
          <div className="mt-2 text-xs text-gray-500">Q{currentQuestionIndex + 1}</div>

          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Raised hands</div>
                <div className="text-sm font-semibold text-gray-900">{currentQuestionSignals.raised}</div>
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {currentQuestionNames.raised.length ? currentQuestionNames.raised.join(', ') : <span className="text-gray-500">None</span>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Marked difficult</div>
                <div className="text-sm font-semibold text-gray-900">{currentQuestionSignals.difficult}</div>
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {currentQuestionNames.difficult.length ? currentQuestionNames.difficult.join(', ') : <span className="text-gray-500">None</span>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Answered</div>
                <div className="text-sm font-semibold text-gray-900">{currentQuestionSignals.answered}</div>
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {currentQuestionNames.answered.length ? currentQuestionNames.answered.join(', ') : <span className="text-gray-500">None</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function endSession() {
    if (!socketRef.current) return;
    setError(null);
    const res = await new Promise((resolve) => {
      socketRef.current.emit(
        'teacher_end_session',
        { sessionId, timestamp: Date.now() },
        resolve
      );
    });
    if (!res?.ok) {
      setError(res?.error || 'Failed to end session');
      return;
    }
    // After ending, jump straight to the session report.
    navigate(`/teacher/live/reports/${sessionId}`);
  }

  async function nextQuestion() {
    if (!socketRef.current) return;
    setError(null);
    const res = await new Promise((resolve) => {
      socketRef.current.emit('teacher_next_question', { sessionId, timestamp: Date.now() }, resolve);
    });
    if (!res?.ok) {
      setError(res?.error || 'Failed to advance');
    }
  }

  const alerts = update?.alerts || {};
  const statusPill = update?.status || 'unknown';

  return (
    <div className="max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Live Session</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-white text-gray-800">
              Session: <span className="ml-1 font-mono text-xs">{sessionId}</span>
            </span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded border ${
                connected
                  ? 'bg-green-50 text-green-800 border-green-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              {connected ? 'Socket connected' : 'Socket disconnected'}
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded border border-gray-200 bg-white text-gray-700">
              Status: <span className="ml-1 font-medium">{statusPill}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pacingMode === 'teacher_led' ? (
            <button
              onClick={nextQuestion}
              className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800"
              title="Advance to the next question for all students"
            >
              Next Qs
            </button>
          ) : null}
          <button
            onClick={() => navigator.clipboard?.writeText(sessionId)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Copy Session ID
          </button>
          <button
            onClick={endSession}
            className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-medium hover:bg-red-700"
          >
            End Session
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('insights')}
          className={`px-3 py-2 text-sm rounded-md border ${
            tab === 'insights'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Live Insights
        </button>
        <button
          type="button"
          onClick={() => setTab('assignment')}
          className={`px-3 py-2 text-sm rounded-md border ${
            tab === 'assignment'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Assignment
        </button>
      </div>

      {tab === 'insights' ? (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Active Students" value={update?.activeStudents ?? '...'} />
            <StatCard
              label="Raised Hands"
              value={update?.raisedHandCount ?? '...'}
              hint={alerts.raisedHands ? 'Alert active' : null}
            />
            <StatCard
              label="Struggling"
              value={update?.strugglingCount ?? '...'}
              hint={alerts.struggling ? 'Alert active' : null}
            />
            <StatCard
              label="Low Accuracy"
              value={(update?.lowAccuracyQuestions || []).length}
              hint={alerts.lowAccuracy ? 'Check difficult questions' : null}
            />
            <StatCard
              label="Inactive"
              value={update?.inactiveCount ?? '...'}
              hint={alerts.inactivity ? 'Students inactive' : null}
            />
          </div>

          {pacingMode === 'teacher_led' ? (
            <div className="mt-6">{renderTeacherLedBoard()}</div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900">Per-Question Signals</h2>
                  <div className="mt-3 space-y-3 text-sm">
                    {perQuestionSignals.length === 0 ? (
                      <div className="text-gray-500">No question signals yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {perQuestionSignals.map((row) => {
                          const raisedNames = (row.raised.students || []).length
                            ? (row.raised.students || []).map((s) => studentLabelFromObject(studentIndex, s)).filter(Boolean)
                            : (row.raised.studentIds || []).map((id) => studentLabel(studentIndex, id)).filter(Boolean);
                          const difficultNames = (row.difficult.students || []).length
                            ? (row.difficult.students || []).map((s) => studentLabelFromObject(studentIndex, s)).filter(Boolean)
                            : (row.difficult.studentIds || []).map((id) => studentLabel(studentIndex, id)).filter(Boolean);
                          const slowNames = (row.slow.students || []).length
                            ? (row.slow.students || []).map((s) => studentLabelFromObject(studentIndex, s)).filter(Boolean)
                            : (row.slow.studentIds || []).map((id) => studentLabel(studentIndex, id)).filter(Boolean);

                          return (
                            <div key={row.questionId} className="rounded-lg border border-gray-200 p-3">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-gray-900">Q{row.questionId}</div>
                                <div className="text-xs text-gray-500">
                                  Hands: {row.raised.count} | Difficult: {row.difficult.count} | Slow: {row.slow.count}
                                </div>
                              </div>

                              <div className="mt-2 grid md:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <div className="text-gray-500">Raised hands</div>
                                  {raisedNames.length ? (
                                    <div className="mt-1 text-gray-800">{raisedNames.join(', ')}</div>
                                  ) : (
                                    <div className="mt-1 text-gray-500">None</div>
                                  )}
                                </div>
                                <div>
                                  <div className="text-gray-500">Marked difficult</div>
                                  {difficultNames.length ? (
                                    <div className="mt-1 text-gray-800">{difficultNames.join(', ')}</div>
                                  ) : (
                                    <div className="mt-1 text-gray-500">None</div>
                                  )}
                                </div>
                                <div>
                                  <div className="text-gray-500">Slow (&gt;60s)</div>
                                  {slowNames.length ? (
                                    <div className="mt-1 text-gray-800">{slowNames.join(', ')}</div>
                                  ) : (
                                    <div className="mt-1 text-gray-500">None</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900">Slow Students (&gt; 60s)</h2>
                  <div className="mt-3">
                    {(update?.slowStudents || []).length === 0 ? (
                      <div className="text-sm text-gray-500">None flagged.</div>
                    ) : (
                      <div className="space-y-2 text-sm">
                        {(update?.slowStudents || []).slice(0, 12).map((s) => (
                          <div key={`${s.studentId}-${s.questionId}`} className="flex items-center justify-between">
                            <div className="text-gray-800">{s.name || s.studentId} on Q{s.questionId}</div>
                            <div className="text-gray-600">{s.seconds}s</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900">Low Accuracy Questions</h2>
                  <div className="mt-3">
                    {(update?.lowAccuracyQuestions || []).length === 0 ? (
                      <div className="text-sm text-gray-500">None flagged.</div>
                    ) : (
                      <div className="space-y-2">
                        {(update?.lowAccuracyQuestions || []).map((q) => (
                          <div key={q.questionId} className="flex items-center justify-between text-sm">
                            <div className="text-gray-800">Question {q.questionId}</div>
                            <div className="font-medium text-amber-700">{q.accuracy}%</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-semibold text-gray-900">Question Stats</h2>
                  <div className="mt-3">
                    {(update?.questionStats || []).length === 0 ? (
                      <div className="text-sm text-gray-500">No attempts yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {(update?.questionStats || []).slice(0, 12).map((q) => (
                          <div key={q.questionId} className="grid grid-cols-4 gap-2 text-sm">
                            <div className="text-gray-800">Q{q.questionId}</div>
                            <div className="text-gray-600">Attempts: {q.attempts}</div>
                            <div className="text-gray-600">Correct: {q.correct}</div>
                            <div className="font-medium text-gray-900">{q.accuracy}%</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      ) : (
        <div className="space-y-4">
          <LiveSessionAssignmentTab
            assignmentId={update?.assignmentId}
            onEndSession={endSession}
            pacingMode={pacingMode}
            currentQuestionIndex={currentQuestionIndex}
            blackboard={blackboard}
            onBlackboardChange={(next) => {
              setBlackboard((prev) => ({ ...prev, ...next }));
              updateBlackboard(next);
            }}
          />

          {pacingMode === 'teacher_led' ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Teacher-led controls</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Current question: Q{currentQuestionId ?? (currentQuestionIndex + 1)}
                  </div>
                </div>
                <div className="text-sm text-gray-700">
                  Hands: <span className="font-semibold">{currentQuestionSignals.raised}</span> · Difficult:{' '}
                  <span className="font-semibold">{currentQuestionSignals.difficult}</span> · Answered:{' '}
                  <span className="font-semibold">{currentQuestionSignals.answered}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
