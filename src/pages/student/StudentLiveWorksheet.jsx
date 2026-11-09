import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSocket } from '../../lib/realtime';

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

function questionStyle({ isCorrect, wrongAttempts, raised, difficult }) {
  if (isCorrect === true) return 'border-green-300 bg-green-50';
  if (raised) return 'border-blue-300 bg-blue-50';
  if (difficult) return 'border-amber-300 bg-amber-50';
  if ((wrongAttempts || 0) >= 2) return 'border-red-300 bg-red-50';
  return 'border-gray-200 bg-white';
}

export default function StudentLiveWorksheet() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [questions, setQuestions] = useState([]); // [{id,text}]
  const [answers, setAnswers] = useState({});
  const [wrongAttempts, setWrongAttempts] = useState({});
  const [raisedHands, setRaisedHands] = useState({});
  const [difficult, setDifficult] = useState({});
  const [correctByQ, setCorrectByQ] = useState({});
  const [error, setError] = useState(null);

  const [pacingMode, setPacingMode] = useState('student_paced'); // student_paced | teacher_led
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [blackboard, setBlackboard] = useState({ questionId: null, workingText: '', showAnswer: false });

  const student = useMemo(() => {
    const raw = sessionStorage.getItem(`matheta:student:${sessionId}`);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!student?.studentId) {
      navigate('/student/join');
    }
  }, [student, navigate]);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => setError(String(err?.message || err));

    const onSessionData = (payload) => {
      if (payload?.error) {
        setError(String(payload.error));
        return;
      }
      // payload: { assignmentTitle, questions: [{id,text}] }
      setAssignmentTitle(String(payload?.assignmentTitle || ''));
      if (payload?.pacingMode) setPacingMode(String(payload.pacingMode));
      if (payload?.currentQuestionIndex !== undefined && payload?.currentQuestionIndex !== null) {
        setCurrentQuestionIndex(Number(payload.currentQuestionIndex) || 0);
      }
      if (payload?.blackboard) {
        setBlackboard({
          questionId: payload.blackboard?.questionId ? String(payload.blackboard.questionId) : null,
          workingText: String(payload.blackboard?.workingText || ''),
          showAnswer: Boolean(payload.blackboard?.showAnswer),
        });
      }
      const qs = Array.isArray(payload?.questions) ? payload.questions : [];
      setQuestions(qs);

      // Initialize per-question state maps
      setAnswers((prev) => {
        const next = { ...prev };
        for (const q of qs) if (next[q.id] === undefined) next[q.id] = '';
        return next;
      });
      setWrongAttempts((prev) => {
        const next = { ...prev };
        for (const q of qs) if (next[q.id] === undefined) next[q.id] = 0;
        return next;
      });
      setRaisedHands((prev) => {
        const next = { ...prev };
        for (const q of qs) if (next[q.id] === undefined) next[q.id] = false;
        return next;
      });
      setDifficult((prev) => {
        const next = { ...prev };
        for (const q of qs) if (next[q.id] === undefined) next[q.id] = false;
        return next;
      });
      setCorrectByQ((prev) => {
        const next = { ...prev };
        for (const q of qs) if (next[q.id] === undefined) next[q.id] = null;
        return next;
      });
    };

    const onPaceUpdate = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      if (payload?.pacingMode) setPacingMode(String(payload.pacingMode));
      if (payload?.currentQuestionIndex !== undefined && payload?.currentQuestionIndex !== null) {
        setCurrentQuestionIndex(Number(payload.currentQuestionIndex) || 0);
      }
      if (payload?.blackboard) {
        setBlackboard({
          questionId: payload.blackboard?.questionId ? String(payload.blackboard.questionId) : null,
          workingText: String(payload.blackboard?.workingText || ''),
          showAnswer: Boolean(payload.blackboard?.showAnswer),
        });
      }
    };

    const onBlackboardUpdate = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      setBlackboard({
        questionId: payload?.questionId ? String(payload.questionId) : null,
        workingText: String(payload?.workingText || ''),
        showAnswer: Boolean(payload?.showAnswer),
      });
    };

    const onHandResolved = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      if (String(payload?.studentId) !== String(student?.studentId)) return;
      const qid = String(payload?.questionId);
      setRaisedHands((prev) => ({ ...prev, [qid]: false }));
    };

    const onAnswerResult = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      if (String(payload?.studentId) !== String(student?.studentId)) return;
      const qid = String(payload?.questionId);
      const isCorrect = payload?.isCorrect;

      if (isCorrect === false) {
        setWrongAttempts((prev) => ({ ...prev, [qid]: (prev[qid] || 0) + 1 }));
        setCorrectByQ((prev) => ({ ...prev, [qid]: false }));
      }
      if (isCorrect === true) {
        setCorrectByQ((prev) => ({ ...prev, [qid]: true }));
      }
      // if null, we keep current visual state.
    };

    const onSessionUpdate = (payload) => {
      // session_update includes status; student doesn't see analytics.
      if (String(payload?.sessionId) !== String(sessionId)) return;
      if (payload?.status === 'ended') {
        navigate('/student/join');
      }
    };

    const onSessionEnded = (payload) => {
      if (String(payload?.sessionId) !== String(sessionId)) return;
      navigate('/student/join');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session_data', onSessionData);
    socket.on('teacher_pace_update', onPaceUpdate);
    socket.on('blackboard_update', onBlackboardUpdate);
    socket.on('hand_resolved', onHandResolved);
    socket.on('answer_result', onAnswerResult);
    socket.on('session_update', onSessionUpdate);
    socket.on('session_ended', onSessionEnded);

    // Join (server will respond with session_data)
    socket.emit(
      'student_join',
      {
        sessionId,
        studentId: student?.studentId,
        name: student?.name,
        timestamp: Date.now(),
      },
      (ack) => {
        if (!ack?.ok) setError(ack?.error || 'Failed to join session');
      }
    );

    // heartbeat
    const hb = setInterval(() => {
      socket.emit('student_activity', {
        sessionId,
        studentId: student?.studentId,
        name: student?.name,
        timestamp: Date.now(),
      });
    }, 20_000);

    return () => {
      clearInterval(hb);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session_data', onSessionData);
      socket.off('teacher_pace_update', onPaceUpdate);
      socket.off('blackboard_update', onBlackboardUpdate);
      socket.off('hand_resolved', onHandResolved);
      socket.off('answer_result', onAnswerResult);
      socket.off('session_update', onSessionUpdate);
      socket.off('session_ended', onSessionEnded);
      socket.disconnect();
    };
  }, [sessionId, student, navigate]);

  const visibleQuestions = useMemo(() => {
    if (pacingMode !== 'teacher_led') return questions;
    const total = (questions || []).length;
    if (total <= 0) return [];
    const idx = Math.max(0, Math.min(total - 1, Number(currentQuestionIndex) || 0));
    return questions[idx] ? [questions[idx]] : [];
  }, [questions, pacingMode, currentQuestionIndex]);

  const shouldShowBlackboard = pacingMode === 'teacher_led';

  function focusQuestion(qid) {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('student_question_focus', {
      sessionId,
      studentId: student?.studentId,
      name: student?.name,
      questionId: qid,
      timestamp: Date.now(),
    });
  }

  async function toggleDifficult(qid) {
    const socket = socketRef.current;
    if (!socket) return;
    setError(null);
    const nextMarked = !Boolean(difficult[qid]);
    const ack = await new Promise((resolve) => {
      socket.emit(
        'student_mark_difficult',
        {
          sessionId,
          studentId: student?.studentId,
          name: student?.name,
          questionId: qid,
          marked: nextMarked,
          timestamp: Date.now(),
        },
        resolve
      );
    });
    if (!ack?.ok) {
      setError(ack?.error || 'Failed to mark difficult');
      return;
    }
    setDifficult((prev) => ({ ...prev, [qid]: nextMarked }));
  }

  function setAnswer(qid, value) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  async function submitAnswer(qid) {
    const socket = socketRef.current;
    if (!socket) return;
    setError(null);

    const payload = {
      sessionId,
      studentId: student?.studentId,
      name: student?.name,
      questionId: qid,
      answer: answers[qid] ?? '',
      timestamp: Date.now(),
    };

    const ack = await new Promise((resolve) => {
      socket.emit('student_answered', payload, resolve);
    });

    if (!ack?.ok) setError(ack?.error || 'Submit failed');
  }

  async function raiseHand(qid) {
    const socket = socketRef.current;
    if (!socket) return;
    setError(null);

    const payload = {
      sessionId,
      studentId: student?.studentId,
      name: student?.name,
      questionId: qid,
      timestamp: Date.now(),
    };

    const ack = await new Promise((resolve) => {
      socket.emit('student_raised_hand', payload, resolve);
    });
    if (!ack?.ok) {
      setError(ack?.error || 'Failed to raise hand');
      return;
    }
    setRaisedHands((prev) => ({ ...prev, [qid]: true }));
  }

  return (
    <div className="flex-1 p-8 bg-gray-100 min-h-screen">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{assignmentTitle || 'Live Worksheet'}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Session <span className="font-mono text-xs">{sessionId}</span>
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2 py-1 rounded border ${
              connected ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {shouldShowBlackboard && (blackboard?.workingText || blackboard?.showAnswer) ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Blackboard</div>
              {blackboard?.workingText ? (
                <pre className="mt-2 whitespace-pre-wrap text-sm font-mono text-gray-900">{blackboard.workingText}</pre>
              ) : (
                <div className="mt-2 text-sm text-gray-500">Teacher is working...</div>
              )}
              {blackboard?.showAnswer ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs font-semibold text-emerald-900">Answer shown</div>
                  <div className="mt-1 text-sm text-emerald-900">Check the working above.</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {visibleQuestions.map((q, idx) => {
            const qid = String(q.id);
            const raised = Boolean(raisedHands[qid]);
            const markedDifficult = Boolean(difficult[qid]);
            const wa = Number(wrongAttempts[qid] || 0);
            const isCorrect = correctByQ[qid];

            return (
              <div
                key={qid}
                className={classNames(
                  'rounded-xl border p-4 shadow-sm',
                  questionStyle({ isCorrect, wrongAttempts: wa, raised, difficult: markedDifficult })
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Q{pacingMode === 'teacher_led' ? currentQuestionIndex + 1 : idx + 1}. {q.text}
                    </div>
                    {isCorrect !== true && wa > 0 && (
                      <div className="mt-1 text-xs text-gray-600">Wrong attempts: {wa}</div>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    {isCorrect === true ? 'Correct' : isCorrect === false ? 'Try again' : ''}
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={answers[qid] ?? ''}
                    onFocus={() => focusQuestion(qid)}
                    onChange={(e) => {
                      focusQuestion(qid);
                      setAnswer(qid, e.target.value);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    placeholder="Type your answer"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => submitAnswer(qid)}
                    className="rounded-lg bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => raiseHand(qid)}
                    disabled={raised}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Raise Hand ✋
                  </button>
                  <button
                    onClick={() => toggleDifficult(qid)}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-sm',
                      markedDifficult
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-gray-300 bg-white hover:bg-gray-50'
                    )}
                  >
                    {markedDifficult ? 'Marked Difficult' : 'Mark Difficult'}
                  </button>
                </div>
              </div>
            );
          })}

          {questions.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
              Waiting for worksheet...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
