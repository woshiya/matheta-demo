import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { httpFetch } from '../../lib/http';

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function badge(label, tone) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border';
  const color =
    tone === 'green'
      ? ' bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'blue'
        ? ' bg-blue-50 text-blue-700 border-blue-200'
        : tone === 'red'
          ? ' bg-red-50 text-red-700 border-red-200'
          : ' bg-gray-100 text-gray-700 border-gray-200';
  return <span className={base + color}>{label}</span>;
}

export default function StudentAssignmentPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Local per-question state
  const [workingsByQ, setWorkingsByQ] = useState({});
  const [finalByQ, setFinalByQ] = useState({});
  const [saveStateByQ, setSaveStateByQ] = useState({}); // questionId -> idle|saving|saved|error
  const [resultByQ, setResultByQ] = useState({}); // questionId -> { isCorrect, pointsAwarded }
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle|submitting

  const startedAtByQ = useRef({}); // questionId -> ms

  const user = useMemo(() => safeParseJson(localStorage.getItem('user')), []);
  const studentId = user?.id;

  useEffect(() => {
    async function load() {
      if (!studentId) {
        setStatus('error');
        setError('Missing student login');
        return;
      }
      setStatus('loading');
      setError(null);

      try {
        const res = await httpFetch(`/api/students/${studentId}/assignments/${assignmentId}`);
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || 'Failed to load assignment');
        }
        const json = await res.json();
        setData(json);

        const questions = Array.isArray(json.questions) ? json.questions : [];
        const answers = Array.isArray(json.answers) ? json.answers : [];
        const byQ = Object.create(null);
        for (const a of answers) byQ[String(a.question_id)] = a;

        // Initialize local inputs from saved answers
        setWorkingsByQ((prev) => {
          const next = { ...prev };
          for (const q of questions) {
            const qid = String(q.id);
            if (next[qid] === undefined) next[qid] = byQ[qid]?.workings || '';
          }
          return next;
        });
        setFinalByQ((prev) => {
          const next = { ...prev };
          for (const q of questions) {
            const qid = String(q.id);
            if (next[qid] === undefined) next[qid] = byQ[qid]?.answer || '';
          }
          return next;
        });
         setResultByQ((prev) => {
           const next = { ...prev };
           for (const q of questions) {
             const qid = String(q.id);
             if (next[qid] === undefined) {
               // When teacher manually marks, those fields are authoritative.
               const teacherPoints = byQ[qid]?.teacher_points_awarded;
               const pointsAwarded =
                 teacherPoints === null || teacherPoints === undefined
                   ? byQ[qid]?.points_awarded
                   : teacherPoints;
               const isCorrect = byQ[qid]?.is_correct;
               next[qid] = {
                 isCorrect: isCorrect === null || isCorrect === undefined ? null : Boolean(isCorrect),
                 pointsAwarded: pointsAwarded === null || pointsAwarded === undefined ? null : Number(pointsAwarded),
               };
             }
           }
           return next;
         });

        setStatus('loaded');
      } catch (err) {
        setStatus('error');
        setError(String(err?.message || err));
      }
    }
    load();
  }, [studentId, assignmentId]);

  const assignment = data?.assignment || null;
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const submission = data?.submission || null;

  const gradingMode = String(assignment?.grading_mode || 'auto');
  const isSubmittedOrGraded = submission?.status === 'submitted' || submission?.status === 'graded';
  const canSubmit = useMemo(() => {
    // Must be answered via final answer (not workings).
    if (!Array.isArray(questions) || questions.length === 0) return false;
    for (const q of questions) {
      const qid = String(q.id);
      if (!String(finalByQ[qid] ?? '').trim()) return false;
    }
    return true;
  }, [questions, finalByQ]);

  async function saveAnswer(questionId) {
    if (!studentId) return;
    const qid = String(questionId);
    setSaveStateByQ((p) => ({ ...p, [qid]: 'saving' }));
    setError(null);

    const startedAt = startedAtByQ.current[qid] || Date.now();
    const responseTimeMs = Date.now() - startedAt;

    try {
      const res = await httpFetch(`/api/students/${studentId}/assignments/${assignmentId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: Number(qid),
          workings: workingsByQ[qid] ?? '',
          finalAnswer: finalByQ[qid] ?? '',
          responseTimeMs,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Failed to save');
      }
      const json = await res.json();

      setResultByQ((p) => ({
        ...p,
        [qid]: {
          isCorrect: json.isCorrect === null || json.isCorrect === undefined ? null : Boolean(json.isCorrect),
          pointsAwarded: json.pointsAwarded === null || json.pointsAwarded === undefined ? null : Number(json.pointsAwarded),
        },
      }));

      setSaveStateByQ((p) => ({ ...p, [qid]: 'saved' }));
      setTimeout(() => setSaveStateByQ((p) => ({ ...p, [qid]: 'idle' })), 900);
    } catch (err) {
      setSaveStateByQ((p) => ({ ...p, [qid]: 'error' }));
      setError(String(err?.message || err));
    }
  }

  async function submitAssignment() {
    if (!studentId) return;
    setError(null);
    setSubmitStatus('submitting');
    try {
      const answers = questions.map((q) => {
        const qid = String(q.id);
        const startedAt = startedAtByQ.current[qid] || Date.now();
        const responseTimeMs = Date.now() - startedAt;
        return {
          questionId: Number(qid),
          workings: workingsByQ[qid] ?? '',
          finalAnswer: finalByQ[qid] ?? '',
          responseTimeMs,
        };
      });

      const res = await httpFetch(`/api/students/${studentId}/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Failed to submit');
      }
      // Go back to the class page. The class page fetches the domain radar,
      // so it will show updated "current" after submission.
      const classId = data?.assignment?.class_id;
      if (classId) {
        navigate(`/student/class/${encodeURIComponent(String(classId))}`, { replace: true });
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setSubmitStatus('idle');
    }
  }

  function startTimer(qid) {
    if (!startedAtByQ.current[qid]) startedAtByQ.current[qid] = Date.now();
  }

  if (status === 'loading') {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="text-sm text-gray-600">Loading assignment...</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex-1 p-8 bg-gray-100 min-h-screen">
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error || 'Failed to load assignment'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{assignment?.title || 'Assignment'}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {assignment?.type ? badge(String(assignment.type).toUpperCase(), 'gray') : null}
              {gradingMode === 'manual' ? badge('Manual marking', 'blue') : badge('Auto marking', 'green')}
              {submission?.status ? badge(`Status: ${submission.status}`, 'gray') : badge('Status: not started', 'gray')}
            </div>
            {assignment?.description ? (
              <p className="text-sm text-gray-600 mt-2">{assignment.description}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/student"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Back
            </Link>
            <button
              onClick={submitAssignment}
              disabled={isSubmittedOrGraded || submitStatus === 'submitting' || !canSubmit}
              className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              title={!canSubmit ? 'Answer all questions before submitting.' : ''}
            >
              {submitStatus === 'submitting' ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, idx) => {
            const qid = String(q.id);
            const saveState = saveStateByQ[qid] || 'idle';
            const res = resultByQ[qid] || { isCorrect: null, pointsAwarded: null };

            const correctnessBadge =
              gradingMode === 'manual'
                ? badge('Awaiting teacher', 'blue')
                : res.isCorrect === true
                  ? badge('Correct', 'green')
                  : res.isCorrect === false
                    ? badge('Wrong', 'red')
                    : badge('Not marked', 'gray');

            return (
              <div key={qid} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Q{idx + 1}. {q.prompt}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      {correctnessBadge}
                      {res.pointsAwarded !== null && res.pointsAwarded !== undefined ? (
                        <span className="text-xs text-gray-600">Points: {res.pointsAwarded}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">{saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : ''}</div>
                </div>

                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-700">Workings</div>
                    <textarea
                      value={workingsByQ[qid] ?? ''}
                      onChange={(e) => {
                        startTimer(qid);
                        setWorkingsByQ((p) => ({ ...p, [qid]: e.target.value }));
                      }}
                      className="mt-2 w-full min-h-[180px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      placeholder="Write your working steps here..."
                      disabled={isSubmittedOrGraded}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700">Final answer (this is what gets marked)</div>
                    <input
                      value={finalByQ[qid] ?? ''}
                      onChange={(e) => {
                        startTimer(qid);
                        setFinalByQ((p) => ({ ...p, [qid]: e.target.value }));
                      }}
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      placeholder="Enter your final answer"
                      disabled={isSubmittedOrGraded}
                    />

                    <div className="mt-3">
                      <button
                        onClick={() => saveAnswer(qid)}
                        disabled={isSubmittedOrGraded || saveState === 'saving'}
                        className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save answer
                      </button>
                      <p className="mt-2 text-xs text-gray-500">
                        Auto marking uses normalization (trim/case/whitespace), fraction/decimal/percent equivalence, and simple algebra equivalence for common forms.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {questions.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              This assignment has no questions.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
